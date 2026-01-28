# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo",
#     "galvani",
#     "polars",
#     "plotly",
#     "pandas",
#     "pyarrow",
#     "numpy",
#     "pint",
# ]
# ///

import marimo

__generated_with = "0.19.4"
app = marimo.App(width="full")


@app.cell
def _():
    import marimo as mo
    import polars as pl
    import plotly.graph_objects as go
    import plotly.express as px
    import io
    import json
    import re
    import zipfile
    import os
    from pathlib import Path
    from datetime import datetime
    from echem_core import (
        load_file_bytes,
        generate_plot_code,
        DataStore,
        calculate_time_average,
        find_hf_intercept,
        ir_compensate,
        downsample,
        TECHNIQUE_MAP,
        TECHNIQUE_DEFAULTS,
        session_import,
        session_export,
        csv_export,
        EchemDataset,
    )
    return (
        DataStore,
        EchemDataset,
        Path,
        TECHNIQUE_DEFAULTS,
        calculate_time_average,
        csv_export,
        datetime,
        find_hf_intercept,
        generate_plot_code,
        go,
        ir_compensate,
        load_file_bytes,
        mo,
        os,
        pl,
        px,
        session_export,
        session_import,
    )


@app.cell
def _(DataStore, pl):
    # Session storage using echem_core DataStore
    store = DataStore()

    def save_df(filename: str, df: pl.DataFrame) -> str:
        """Save DataFrame to temp parquet file, return path."""
        safe_name = filename.replace('/', '_').replace('\\', '_')
        path = f"{store.storage_dir}/{safe_name}.parquet"
        df.write_parquet(path)
        return path

    def load_df(path: str) -> pl.DataFrame:
        """Load DataFrame from temp parquet file."""
        return pl.read_parquet(path)
    return load_df, save_df


@app.cell
def _(Path, load_file_bytes, save_df):
    def process_files_from_dict(files_dict: dict) -> dict:
        """Process a dict of {path: bytes} containing .mpr or .dta files."""
        ec_data = {}
        for fpath, content in files_dict.items():
            filename = Path(fpath).name
            lower_name = filename.lower()

            # Skip unsupported file types
            if not (lower_name.endswith('.mpr') or lower_name.endswith('.dta')):
                continue

            try:
                dataset = load_file_bytes(content, filename)
                df_path = save_df(filename, dataset.df)

                ec_data[filename] = {
                    'path': fpath,
                    'filename': filename,
                    'label': dataset.label or filename,
                    'timestamp': dataset.timestamp.isoformat() if dataset.timestamp else None,
                    'df_path': df_path,
                    'columns': dataset.columns,
                    'technique': dataset.technique,
                    'source': dataset.source_format,
                    'cycles': dataset.cycles,
                }
            except Exception:
                pass  # Skip files that fail to parse

        return ec_data
    return (process_files_from_dict,)


@app.cell
def _(mo):
    # File upload widgets - supports BioLogic (.mpr) and Gamry (.dta)
    mpr_upload = mo.ui.file(
        kind="area",
        filetypes=[".mpr", ".dta", ".DTA"],
        multiple=True,
        label="Add .mpr or .dta files"
    )

    session_upload = mo.ui.file(
        kind="button",
        filetypes=[".zip"],
        multiple=False,
        label="Import session (.zip)"
    )

    # State to persist ec_data across uploads and track processed files
    get_ec_data, set_ec_data = mo.state({})
    get_processed_files, set_processed_files = mo.state(set())
    return (
        get_ec_data,
        get_processed_files,
        mpr_upload,
        session_upload,
        set_ec_data,
        set_processed_files,
    )


@app.cell
def _(
    get_ec_data,
    get_processed_files,
    mpr_upload,
    process_files_from_dict,
    save_df,
    session_import,
    session_upload,
    set_ec_data,
    set_processed_files,
):
    # Process uploaded files - adds to existing data instead of replacing
    _current_data = get_ec_data()
    _processed = get_processed_files()
    _new_data = dict(_current_data)  # Copy current data

    if session_upload.value:
        # Session import replaces all data
        try:
            zip_bytes = session_upload.value[0].contents
            datasets, _ui_state = session_import(zip_bytes)
            _new_data = {}
            for ds in datasets:
                df_path = save_df(ds.filename, ds.df)
                _new_data[ds.filename] = {
                    'path': ds.original_filename or ds.filename,
                    'filename': ds.filename,
                    'label': ds.label or ds.filename,
                    'timestamp': ds.timestamp.isoformat() if ds.timestamp else None,
                    'df_path': df_path,
                    'columns': ds.columns,
                    'technique': ds.technique,
                    'source': ds.source_format,
                    'cycles': ds.cycles,
                }
            set_ec_data(_new_data)
            set_processed_files(set(_new_data.keys()))
        except Exception as e:
            print(f"Error importing session: {e}")

    elif mpr_upload.value:
        # Add new files (skip already processed)
        _files_to_process = {
            f.name: f.contents
            for f in mpr_upload.value
            if f.name not in _processed
        }
        if _files_to_process:
            _added = process_files_from_dict(_files_to_process)
            _new_data.update(_added)
            set_ec_data(_new_data)
            set_processed_files(_processed | set(_added.keys()))

    # Export current state as ec_data for other cells
    ec_data = get_ec_data()
    return (ec_data,)


@app.cell
def _(ec_data, file_metadata):
    # Group files by technique - uses file_metadata (edited values) with ec_data as fallback
    files_by_technique = {}
    detected_techniques = []

    if ec_data:
        for _fname, _info in ec_data.items():
            # Use edited technique from file_metadata if available, else fall back to ec_data
            if file_metadata and _fname in file_metadata:
                _tech = file_metadata[_fname].get('technique')
            else:
                _tech = _info.get('technique')

            if _tech:
                if _tech not in files_by_technique:
                    files_by_technique[_tech] = []
                files_by_technique[_tech].append(_fname)

        # Sort techniques in a logical order
        _technique_order = ['CV', 'LSV', 'CA', 'CP', 'OCV', 'OCP', 'PEIS', 'GEIS', 'EIS', 'CC', 'ZIR']
        detected_techniques = [t for t in _technique_order if t in files_by_technique]
        # Add any techniques not in the predefined order
        for t in sorted(files_by_technique.keys()):
            if t not in detected_techniques:
                detected_techniques.append(t)
    return detected_techniques, files_by_technique


@app.cell
def _(ec_data, files_by_technique, find_hf_intercept, load_df, mo):
    # iR Correction controls - select PEIS file and apply correction
    ir_correction_controls = None
    ir_r_values = {}  # Store R values from PEIS files: {filename: R_ohm}

    # Find available PEIS files
    peis_files = []
    for tech in ('PEIS', 'GEIS', 'EIS'):
        if tech in files_by_technique:
            peis_files.extend(files_by_technique[tech])

    if peis_files and ec_data:
        # Calculate R values (HF intercept) for all PEIS files
        for _fname in peis_files:
            if _fname in ec_data:
                try:
                    _df = load_df(ec_data[_fname]['df_path'])
                    _r = find_hf_intercept(_df)
                    if _r is not None:
                        ir_r_values[_fname] = _r
                except Exception:
                    pass

        # Build dropdown options: "filename (R = X.XX Ω)"
        _peis_options = {"None": None}
        for _fname, _r in ir_r_values.items():
            _label = ec_data[_fname]['label'] if _fname in ec_data else _fname
            _peis_options[f"{_label} (R = {_r:.3f} Ω)"] = _fname

        ir_correction_controls = mo.ui.dictionary({
            "peis_file": mo.ui.dropdown(
                options=_peis_options,
                value="None",
                label="PEIS file for iR correction"
            ),
            "apply_correction": mo.ui.checkbox(
                value=False,
                label="Apply iR correction"
            ),
        })

    return ir_correction_controls, ir_r_values


@app.cell
def _(detected_techniques, mo):
    # Technique tabs - one tab per detected technique
    technique_tabs = None

    if detected_techniques:
        # Create tabs dict: {label: label} since we just need the technique name
        _tabs_dict = {tech: tech for tech in detected_techniques}
        technique_tabs = mo.ui.tabs(
            _tabs_dict,
            lazy=False  # Keep all tabs rendered for faster switching
        )
    return (technique_tabs,)


@app.cell
def _(ec_data, files_by_technique, mo, technique_tabs):
    # File selector - filtered to active technique tab, auto-selects all files
    file_selector = None
    active_technique = None

    if ec_data and technique_tabs is not None:
        active_technique = technique_tabs.value

        if active_technique and active_technique in files_by_technique:
            _tech_files = files_by_technique[active_technique]

            # Build file options for this technique only
            _file_options = {}
            for _fname in _tech_files:
                if _fname in ec_data:
                    _info = ec_data[_fname]
                    _display = _info['label']
                    _file_options[_display] = _fname

            file_selector = mo.ui.multiselect(
                options=_file_options,
                label="Files",
                value=list(_file_options.keys())  # Auto-select all
            )
    return active_technique, file_selector


@app.cell
def _(
    TECHNIQUE_DEFAULTS,
    active_technique,
    ec_data,
    file_metadata,
    file_selector,
    ir_correction_controls,
    ir_r_values,
    load_df,
    mo,
):
    # Chart builder with mo.ui.dictionary for proper reactivity
    # Now uses active_technique from tabs instead of detecting predominant technique
    chart_batch = None
    cycle_selector = None
    technique_controls = None  # Technique-specific controls (PEIS mode, CA/CP averaging)
    time_range_info = None  # For CA/CP: (min_time, max_time)

    if ec_data and file_selector is not None and file_selector.value:
        _first_file = file_selector.value[0]
        if _first_file in ec_data:
            _columns = list(ec_data[_first_file]['columns'])

            # Add potential_ir_corrected_V column option if iR correction is enabled
            _ir_correction_available = False
            if ir_correction_controls is not None:
                _ir_values = ir_correction_controls.value
                _ir_peis_file = _ir_values.get("peis_file")
                _ir_apply = _ir_values.get("apply_correction", False)
                if _ir_apply and _ir_peis_file in ir_r_values:
                    # Check if files have required columns for correction
                    if 'potential_V' in _columns and 'current_A' in _columns:
                        _ir_correction_available = True
                        if 'potential_ir_corrected_V' not in _columns:
                            _columns.append('potential_ir_corrected_V')

            # Escape column names for display (< and > get interpreted as HTML)
            def _escape(s):
                return s.replace('<', '‹').replace('>', '›')

            _col_options = {_escape(c): c for c in _columns}

            # Use active_technique from tabs (already filtered by tab)
            _technique = active_technique

            # Collect available cycles from selected files (for CV/LSV)
            _all_cycles = set()
            _has_cycles = False
            for _fname in file_selector.value:
                if _fname in ec_data:
                    _file_cycles = ec_data[_fname].get('cycles', [])
                    if _file_cycles:
                        _has_cycles = True
                        _all_cycles.update(_file_cycles)

            # Create cycle selector if cycles are available (CV, LSV)
            if _has_cycles and len(_all_cycles) > 1 and _technique in ('CV', 'LSV'):
                _sorted_cycles = sorted(int(_c) for _c in _all_cycles)
                _cycle_options = {str(_c): _c for _c in _sorted_cycles}
                cycle_selector = mo.ui.multiselect(
                    options=_cycle_options,
                    value=[str(_sorted_cycles[0])],
                    label="Cycles"
                )

            # Create technique-specific controls (CA/CP only - PEIS mode is in chart_batch)
            if _technique in ('CA', 'CP'):
                # CA/CP: Time range averaging
                # Get time range from first file
                _df = load_df(ec_data[_first_file]['df_path'])
                _t_min, _t_max = 0.0, 100.0
                if 'time/s' in _df.columns:
                    _t_min = float(_df['time/s'].min())
                    _t_max = float(_df['time/s'].max())
                time_range_info = (_t_min, _t_max)

                technique_controls = mo.ui.dictionary({
                    "avg_start": mo.ui.number(
                        value=round(_t_max * 0.8, 1),  # Default to last 20%
                        start=_t_min,
                        stop=_t_max,
                        step=0.1,
                        label="Avg start (s)"
                    ),
                    "avg_end": mo.ui.number(
                        value=round(_t_max, 1),
                        start=_t_min,
                        stop=_t_max,
                        step=0.1,
                        label="Avg end (s)"
                    ),
                })

            # Smart defaults based on technique
            _x_default = None
            _y_default = None

            if _technique and _technique in TECHNIQUE_DEFAULTS:
                _tech_defaults = TECHNIQUE_DEFAULTS[_technique]
                if _tech_defaults['x'] in _columns:
                    _x_default = _tech_defaults['x']
                if _tech_defaults['y'] in _columns:
                    _y_default = _tech_defaults['y']

            # Fallback to generic defaults (using standardized SI column names)
            if _x_default is None:
                _x_default = 'time_s' if 'time_s' in _columns else _columns[0]
            if _y_default is None:
                for _col in ['current_A', 'potential_V']:
                    if _col in _columns:
                        _y_default = _col
                        break
            if _y_default is None:
                _y_default = _columns[1] if len(_columns) > 1 else _columns[0]

            # Color schemes
            _color_schemes = {
                "Viridis": "Viridis", "Plasma": "Plasma", "Inferno": "Inferno",
                "Magma": "Magma", "Cividis": "Cividis", "Turbo": "Turbo",
                "Blues": "Blues", "Reds": "Reds", "Greens": "Greens", "Spectral": "Spectral",
            }

            # Build legend source options from file_metadata columns
            _legend_options = {"Label": "label", "Filename": "filename", "Technique": "technique"}
            if file_metadata:
                _first_meta = next(iter(file_metadata.values()), {})
                for _key in _first_meta.keys():
                    if _key not in ['filename', 'label', 'technique']:
                        _display = _key.replace('_', ' ').title()
                        _legend_options[_display] = _key

            # Marker type options
            _marker_types = {
                "Circle": "circle", "Square": "square", "Diamond": "diamond",
                "Cross": "cross", "X": "x", "Triangle Up": "triangle-up",
                "Triangle Down": "triangle-down", "Star": "star", "Hexagon": "hexagon",
            }

            # Legend position options
            _legend_positions = {
                "Right": "right", "Left": "left", "Top": "top", "Bottom": "bottom",
                "Top Right": "top_right", "Top Left": "top_left",
                "Bottom Right": "bottom_right", "Bottom Left": "bottom_left",
            }

            # Create dictionary with all controls for proper reactivity
            chart_batch = mo.ui.dictionary({
                # Plot type controls
                "plot_type": mo.ui.dropdown(
                    options={"Overlay": "overlay", "Time Order": "time_order", "Y-Axis Stacked": "y_stacked"},
                    value="Overlay", label="Plot type"
                ),
                "stacked_gap": mo.ui.slider(value=5, start=0, stop=20, step=1, label="Gap between axes (%)"),
                "hide_y_labels": mo.ui.checkbox(value=False, label="Hide Y labels"),
                # Data controls (escape defaults to match escaped keys)
                "x_col": mo.ui.dropdown(options=_col_options, value=_escape(_x_default), label="X column"),
                "y_col": mo.ui.dropdown(options=_col_options, value=_escape(_y_default), label="Y column"),
                "time_unit": mo.ui.dropdown(
                    options={"Seconds (s)": "s", "Minutes (min)": "min", "Hours (h)": "h"},
                    value="Seconds (s)", label="Time unit (for x-axis)"
                ),
                # Appearance controls
                "color_scheme": mo.ui.dropdown(options=_color_schemes, value="Viridis", label="Color scheme"),
                "line_mode": mo.ui.dropdown(
                    options={"Lines": "lines", "Markers": "markers", "Lines + Markers": "lines+markers"},
                    value="Lines", label="Mode"
                ),
                "marker_type": mo.ui.dropdown(options=_marker_types, value="Circle", label="Marker type"),
                "axis_linewidth": mo.ui.slider(value=4, start=1, stop=6, step=1, label="Axis line width"),
                "trace_linewidth": mo.ui.slider(value=2, start=1, stop=6, step=1, label="Trace line width"),
                "marker_size": mo.ui.slider(value=6, start=2, stop=16, step=1, label="Marker size"),
                # Axis controls
                "x_scale": mo.ui.dropdown(options={"Linear": "linear", "Log": "log"}, value="Linear", label="X scale"),
                "y_scale": mo.ui.dropdown(options={"Linear": "linear", "Log": "log"}, value="Linear", label="Y scale"),
                "x_min": mo.ui.text(value="", label="X min", placeholder="Auto"),
                "x_max": mo.ui.text(value="", label="X max", placeholder="Auto"),
                "y_min": mo.ui.text(value="", label="Y min", placeholder="Auto"),
                "y_max": mo.ui.text(value="", label="Y max", placeholder="Auto"),
                "show_grid": mo.ui.checkbox(value=True, label="Show grid"),
                # PEIS plot mode (Nyquist/Bode) - shown in Appearance for EIS techniques
                "peis_mode": mo.ui.dropdown(
                    options={"Nyquist": "nyquist", "Bode Magnitude": "bode_mag", "Bode Phase": "bode_phase"},
                    value="Nyquist",
                    label="EIS plot type"
                ),
                # Size controls
                "plot_height": mo.ui.slider(value=500, start=300, stop=900, step=50, label="Height"),
                "plot_width": mo.ui.slider(value=800, start=500, stop=1200, step=50, label="Width"),
                # Labels controls
                "plot_title": mo.ui.text(value="", label="Title", placeholder="Auto-generated"),
                "x_label": mo.ui.text(value="", label="X-axis label", placeholder="Auto from column"),
                "y_label": mo.ui.text(value="", label="Y-axis label", placeholder="Auto from column"),
                "title_fontsize": mo.ui.slider(value=20, start=10, stop=32, step=1, label="Title font size"),
                "label_fontsize": mo.ui.slider(value=16, start=8, stop=24, step=1, label="Axis label font size"),
                "tick_fontsize": mo.ui.slider(value=16, start=8, stop=20, step=1, label="Tick font size"),
                # Legend controls
                "show_legend": mo.ui.checkbox(value=True, label="Show legend"),
                "legend_source": mo.ui.dropdown(options=_legend_options, value="Label", label="Legend source"),
                "legend_position": mo.ui.dropdown(options=_legend_positions, value="Right", label="Position"),
                "legend_fontsize": mo.ui.slider(value=14, start=8, stop=24, step=1, label="Font size"),
            })
    return chart_batch, cycle_selector, technique_controls


@app.cell
def _(
    active_technique,
    chart_batch,
    cycle_selector,
    file_selector,
    ir_correction_controls,
    mo,
    technique_controls,
):
    # Sidebar UI - always visible, shows placeholder when no data
    # Now uses technique tabs instead of technique_filter dropdown
    if file_selector is not None:
        # Build data section items (file selection)
        _data_items = [file_selector]

        # Add chart_batch controls if available (requires files to be selected)
        if chart_batch is not None:
            # Add column selectors to data section
            _data_items.extend([
                chart_batch["x_col"], chart_batch["y_col"],
                chart_batch["time_unit"],
            ])

            # Add iR correction controls if available (CV, LSV, CA, CP techniques)
            if ir_correction_controls is not None and active_technique in ('CV', 'LSV', 'CA', 'CP'):
                _data_items.extend([
                    ir_correction_controls["peis_file"],
                    ir_correction_controls["apply_correction"],
                ])

            # Add technique-specific controls based on active tab (CA/CP averaging)
            if technique_controls is not None:
                if active_technique in ('CA', 'CP'):
                    _data_items.extend([
                        technique_controls["avg_start"],
                        technique_controls["avg_end"],
                    ])

            # Add cycle selector if available (CV/LSV)
            if cycle_selector is not None:
                _data_items.append(cycle_selector)

            # Plot type items - show stacked options only for y_stacked mode
            _plot_type_items = [chart_batch["plot_type"]]
            if chart_batch["plot_type"].value == "y_stacked":
                _plot_type_items.extend([
                    chart_batch["stacked_gap"],
                    chart_batch["hide_y_labels"],
                ])

            # Build appearance items based on mode
            _appearance_items = []
            # Add PEIS plot type dropdown for EIS techniques
            if active_technique in ('PEIS', 'GEIS', 'EIS'):
                _appearance_items.append(chart_batch["peis_mode"])
            _appearance_items.extend([
                chart_batch["color_scheme"],
                chart_batch["line_mode"],
                chart_batch["axis_linewidth"],
            ])
            # Show marker controls when markers are used
            if chart_batch["line_mode"].value in ("markers", "lines+markers"):
                _appearance_items.extend([chart_batch["marker_type"], chart_batch["marker_size"]])
            if chart_batch["line_mode"].value in ("lines", "lines+markers"):
                _appearance_items.append(chart_batch["trace_linewidth"])

            # Legend items
            _legend_items = [
                chart_batch["show_legend"],
                chart_batch["legend_source"],
                chart_batch["legend_position"],
                chart_batch["legend_fontsize"],
            ]

            chart_sidebar = mo.vstack([
                mo.accordion({
                    "**Data**": mo.vstack(_data_items),
                    "**Plot Type**": mo.vstack(_plot_type_items),
                    "**Appearance**": mo.vstack(_appearance_items),
                    "**Legend**": mo.vstack(_legend_items),
                    "**Axes**": mo.vstack([
                        chart_batch["x_scale"], chart_batch["y_scale"],
                        mo.hstack([chart_batch["x_min"], chart_batch["x_max"]], justify="start"),
                        mo.hstack([chart_batch["y_min"], chart_batch["y_max"]], justify="start"),
                        chart_batch["show_grid"],
                    ]),
                    "**Size**": mo.vstack([chart_batch["plot_height"], chart_batch["plot_width"]]),
                    "**Labels**": mo.vstack([
                        chart_batch["plot_title"], chart_batch["x_label"], chart_batch["y_label"],
                        chart_batch["title_fontsize"], chart_batch["label_fontsize"], chart_batch["tick_fontsize"],
                    ]),
                }),
            ], align="stretch")
        else:
            # Data loaded but no files selected - show file selector with placeholders for other controls
            chart_sidebar = mo.vstack([
                mo.accordion({
                    "**Data**": mo.vstack(_data_items + [mo.md("*Select files to configure plot*")]),
                    "**Plot Type**": mo.md("*Select files to configure*"),
                    "**Appearance**": mo.md("*Select files to configure*"),
                    "**Legend**": mo.md("*Select files to configure*"),
                    "**Axes**": mo.md("*Select files to configure*"),
                    "**Size**": mo.md("*Select files to configure*"),
                    "**Labels**": mo.md("*Select files to configure*"),
                }),
            ], align="stretch")
    else:
        # No data loaded at all
        chart_sidebar = mo.vstack([
            mo.accordion({
                "**Data**": mo.md("*Upload files to configure*"),
                "**Plot Type**": mo.md("*Upload files to configure*"),
                "**Appearance**": mo.md("*Upload files to configure*"),
                "**Legend**": mo.md("*Upload files to configure*"),
                "**Axes**": mo.md("*Upload files to configure*"),
                "**Size**": mo.md("*Upload files to configure*"),
                "**Labels**": mo.md("*Upload files to configure*"),
            }),
        ], align="stretch")
    return (chart_sidebar,)


@app.cell
def _(ec_data, mo):
    # File metadata spreadsheet editor - creates the UI element
    metadata_editor = None

    if ec_data:
        # Build initial metadata from ec_data as list of dicts
        _rows = []
        for _fname, _info in ec_data.items():
            _rows.append({
                'filename': _fname,
                'label': _info.get('label', _fname),
                'technique': _info.get('technique', ''),
            })

        # Use data_editor for spreadsheet-like editing
        # All columns editable (filename/label/technique overridden from source in extraction)
        metadata_editor = mo.ui.data_editor(
            data=_rows,
            label="**File Metadata** - Edit 'legend' or add custom columns",
            editable_columns="all",
        )
    return (metadata_editor,)


@app.cell
def _(
    ec_data,
    get_ec_data,
    get_processed_files,
    metadata_editor,
    os,
    set_ec_data,
    set_processed_files,
):
    # Build file_metadata dict from edited data_editor values (reactive to edits)
    # Also handles file deletion when rows are removed from the editor
    file_metadata = {}

    if metadata_editor is not None and ec_data:
        _edited_data = metadata_editor.value  # List of dicts from data_editor
        if _edited_data is not None:
            # Get filenames currently in editor
            _editor_files = {_row['filename'] for _row in _edited_data if 'filename' in _row}
            _current_files = set(ec_data.keys())

            # Detect deleted files (in ec_data but not in editor)
            _deleted_files = _current_files - _editor_files
            if _deleted_files:
                _new_data = {k: v for k, v in get_ec_data().items() if k not in _deleted_files}
                _new_processed = get_processed_files() - _deleted_files
                # Clean up temp files for deleted entries
                for _fname in _deleted_files:
                    _old_path = ec_data[_fname].get('df_path')
                    if _old_path and os.path.exists(_old_path):
                        os.unlink(_old_path)
                set_ec_data(_new_data)
                set_processed_files(_new_processed)

            # Build file_metadata for remaining files
            for _row in _edited_data:
                _fname = _row.get('filename')
                if _fname and _fname in ec_data:
                    _source = ec_data[_fname]
                    # Start with all edited values (including custom columns)
                    _meta = dict(_row)
                    # Only filename is protected - label and technique can be edited
                    _meta['filename'] = _fname
                    # Use edited values if present, otherwise fall back to source
                    if not _meta.get('label'):
                        _meta['label'] = _source.get('label', _fname)
                    if not _meta.get('technique'):
                        _meta['technique'] = _source.get('technique', '')
                    file_metadata[_fname] = _meta
    return (file_metadata,)


@app.cell
def _(
    active_technique,
    calculate_time_average,
    chart_batch,
    cycle_selector,
    ec_data,
    file_metadata,
    file_selector,
    find_hf_intercept,
    go,
    ir_compensate,
    ir_correction_controls,
    ir_r_values,
    load_df,
    pl,
    px,
    technique_controls,
):
    # Chart figure - rebuilds when values change (uses Scattergl for performance)
    # Now handles PEIS Nyquist/Bode modes and calculates analysis values
    chart_figure = None
    downsampled_files = []  # Track which files were downsampled
    analysis_results = {}  # Store analysis results (iR intercept, averages)

    # Check if iR correction should be applied
    _apply_ir_correction = False
    _ir_resistance = None
    _ir_peis_file = None
    if ir_correction_controls is not None:
        _ir_values = ir_correction_controls.value
        _ir_peis_file = _ir_values.get("peis_file")
        _apply_ir_correction = _ir_values.get("apply_correction", False) and _ir_peis_file is not None
        if _apply_ir_correction and _ir_peis_file in ir_r_values:
            _ir_resistance = ir_r_values[_ir_peis_file]
            # Store iR correction info in analysis_results
            analysis_results['ir_correction'] = {
                'peis_file': _ir_peis_file,
                'resistance_ohm': _ir_resistance,
            }

    if chart_batch is not None and ec_data and file_selector is not None and file_selector.value:
        _v = chart_batch.value
        _selected = [f for f in file_selector.value if f in ec_data]
        _n = len(_selected)
        _plot_type = _v["plot_type"]
        _stacked_gap = _v.get("stacked_gap", 5) / 100.0  # Gap between stacked axes
        _hide_y_labels = _v.get("hide_y_labels", False)

        if _n > 0 and _v:
            chart_figure = go.Figure()
            _palette = getattr(px.colors.sequential, _v["color_scheme"], px.colors.sequential.Viridis)
            _colors = [_palette[int(i * (len(_palette) - 1) / max(_n - 1, 1))] for i in range(_n)]
            _xcol, _ycol = _v["x_col"], _v["y_col"]
            _mode = _v["line_mode"]
            _grid = _v["show_grid"]
            _time_unit = _v.get("time_unit", "s")

            # Handle PEIS mode - override x/y columns based on plot mode
            _peis_mode = None
            if active_technique in ('PEIS', 'GEIS', 'EIS'):
                _peis_mode = _v.get("peis_mode", "nyquist")
                if _peis_mode == "nyquist":
                    _xcol, _ycol = 'z_real_Ohm', 'z_imag_Ohm'
                elif _peis_mode == "bode_mag":
                    _xcol, _ycol = 'frequency_Hz', 'z_mag_Ohm'
                elif _peis_mode == "bode_phase":
                    _xcol, _ycol = 'frequency_Hz', 'z_phase_deg'

            # Calculate analysis results for CA/CP
            if active_technique in ('CA', 'CP') and technique_controls is not None:
                _tc = technique_controls.value
                _avg_start = _tc.get("avg_start", 0)
                _avg_end = _tc.get("avg_end", 100)
                _avg_col = 'current_A' if active_technique == 'CA' else 'potential_V'
                _averages = {}
                for _fname in _selected:
                    _df = load_df(ec_data[_fname]['df_path'])
                    _avg = calculate_time_average(_df, _avg_col, _avg_start, _avg_end)
                    if _avg is not None:
                        _averages[_fname] = _avg
                if _averages:
                    analysis_results['averages'] = _averages
                    analysis_results['avg_column'] = _avg_col
                    analysis_results['avg_range'] = (_avg_start, _avg_end)

            # Calculate iR intercept for PEIS
            if active_technique in ('PEIS', 'GEIS', 'EIS'):
                _intercepts = {}
                for _fname in _selected:
                    _df = load_df(ec_data[_fname]['df_path'])
                    _intercept = find_hf_intercept(_df)
                    if _intercept is not None:
                        _intercepts[_fname] = _intercept
                if _intercepts:
                    analysis_results['ir_intercepts'] = _intercepts
            # Time conversion factor (data assumed to be in seconds)
            _time_factor = 1.0
            _time_label_suffix = "s"
            if _time_unit == "min":
                _time_factor = 1.0 / 60.0
                _time_label_suffix = "min"
            elif _time_unit == "h":
                _time_factor = 1.0 / 3600.0
                _time_label_suffix = "h"
            _axis_lw = _v.get("axis_linewidth", 2)
            _trace_lw = _v.get("trace_linewidth", 2)
            _marker_size = _v.get("marker_size", 6)
            _marker_type = _v.get("marker_type", "circle")
            _title_fontsize = _v.get("title_fontsize", 18)
            _label_fontsize = _v.get("label_fontsize", 14)
            _tick_fontsize = _v.get("tick_fontsize", 12)
            _show_legend = _v.get("show_legend", True)
            _legend_position = _v.get("legend_position", "right")
            _legend_fontsize = _v.get("legend_fontsize", 14)
            # Escape function for display (< and > get interpreted as HTML)
            def _escape(s):
                return s.replace('<', '‹').replace('>', '›')
            # Custom axis labels (fallback to escaped column names)
            # Set axis labels based on technique and mode
            if _peis_mode == "nyquist":
                _x_label_default = '|Re(Z)| / Ohm'
                _y_label_default = '|Im(Z)| / Ohm'
            elif _peis_mode == "bode_mag":
                _x_label_default = 'Frequency / Hz'
                _y_label_default = '|Z| / Ohm'
            elif _peis_mode == "bode_phase":
                _x_label_default = 'Frequency / Hz'
                _y_label_default = 'Phase / deg'
            elif 'time' in _xcol.lower():
                # Handle standardized time column (time_s)
                if _xcol == 'time_s':
                    _x_label_default = f'Time / {_time_label_suffix}'
                else:
                    _x_label_default = _escape(_xcol).replace('_s', f' / {_time_label_suffix}')
                _y_label_default = _escape(_ycol)
            else:
                _x_label_default = _escape(_xcol)
                _y_label_default = _escape(_ycol)
            _x_label = _v.get("x_label", "") or _x_label_default
            _y_label = _v.get("y_label", "") or _y_label_default

            # Sort files by timestamp for time_order mode
            if _plot_type == "time_order":
                _selected = sorted(_selected, key=lambda f: ec_data[f].get('timestamp') or '')

            _x_offset = 0  # For time_order mode
            _legend_src = _v.get("legend_source", "legend")

            # Legend position mapping
            _legend_config = {'font': {'size': _legend_fontsize}, 'bgcolor': 'rgba(0,0,0,0)'}
            _top_margin = 50  # Default top margin
            _bottom_margin = 50  # Default bottom margin
            if _legend_position == "right":
                _legend_config.update({'orientation': 'v', 'yanchor': 'top', 'y': 1, 'xanchor': 'left', 'x': 1.02})
            elif _legend_position == "left":
                _legend_config.update({'orientation': 'v', 'yanchor': 'top', 'y': 1, 'xanchor': 'right', 'x': -0.15})
            elif _legend_position == "top":
                _legend_config.update({'orientation': 'h', 'yanchor': 'bottom', 'y': 1.02, 'xanchor': 'center', 'x': 0.5})
                _top_margin = 100  # Extra margin for legend above plot
            elif _legend_position == "bottom":
                _legend_config.update({'orientation': 'h', 'yanchor': 'top', 'y': -0.2, 'xanchor': 'center', 'x': 0.5})
                _bottom_margin = 80  # Extra margin for legend below plot
            elif _legend_position == "top_right":
                _legend_config.update({'orientation': 'v', 'yanchor': 'top', 'y': 0.99, 'xanchor': 'right', 'x': 0.99})
            elif _legend_position == "top_left":
                _legend_config.update({'orientation': 'v', 'yanchor': 'top', 'y': 0.99, 'xanchor': 'left', 'x': 0.01})
            elif _legend_position == "bottom_right":
                _legend_config.update({'orientation': 'v', 'yanchor': 'bottom', 'y': 0.01, 'xanchor': 'right', 'x': 0.99})
            elif _legend_position == "bottom_left":
                _legend_config.update({'orientation': 'v', 'yanchor': 'bottom', 'y': 0.01, 'xanchor': 'left', 'x': 0.01})

            # Calculate y-axis domains for stacked mode
            if _plot_type == "y_stacked" and _n > 1:
                _total_gap = _stacked_gap * (_n - 1)
                _axis_height = (1.0 - _total_gap) / _n
                _domains = []
                for _i in range(_n):
                    _bottom = _i * (_axis_height + _stacked_gap)
                    _top = _bottom + _axis_height
                    _domains.append([_bottom, _top])
            else:
                _domains = [[0, 1]] * _n

            # For time_order mode, override x column to time/s (required for offset logic)
            if _plot_type == "time_order":
                # Find a time column from the first file's columns
                _first_cols = ec_data[_selected[0]]['columns'] if _selected else []
                for _time_col in ['time/s', 'T', 'Time', 'time']:
                    if _time_col in _first_cols:
                        _xcol = _time_col
                        break
                # Update x label to reflect time column
                _x_label_default = _escape(_xcol)
                if 'time' in _xcol.lower() and '/s' in _xcol:
                    _x_label_default = _x_label_default.replace('/s', f'/{_time_label_suffix}')
                _x_label = _v.get("x_label", "") or _x_label_default

            # Get selected cycles (if cycle selector is active)
            _selected_cycles = None
            if cycle_selector is not None and cycle_selector.value:
                _selected_cycles = cycle_selector.value  # Already integers from options dict

            for _i, _fname in enumerate(_selected):
                _data = ec_data[_fname]
                _df = load_df(_data['df_path'])

                # Apply iR correction if enabled (adds potential_ir_corrected_V column)
                if _apply_ir_correction and _ir_resistance is not None:
                    if 'potential_V' in _df.columns and 'current_A' in _df.columns:
                        _df = _df.with_columns(
                            (pl.col('potential_V') - pl.col('current_A') * _ir_resistance).alias('potential_ir_corrected_V')
                        )

                # Filter by selected cycles
                if _selected_cycles is not None and 'cycle' in _df.columns:
                    _df = _df.filter(pl.col('cycle').is_in(_selected_cycles))

                # Get label based on legend_source selection
                _lbl = _data['label']
                if file_metadata and _fname in file_metadata:
                    _meta = file_metadata[_fname]
                    _lbl = _meta.get(_legend_src, _meta.get('label', _data['label']))
                elif _legend_src == "filename":
                    _lbl = _fname
                elif _legend_src == "technique":
                    _lbl = _data.get('technique', _data['label'])

                if _xcol in _df.columns and _ycol in _df.columns:
                    _x_data = _df[_xcol].to_numpy().copy()
                    _y_data = _df[_ycol].to_numpy().copy()

                    # For EIS techniques, display z columns as absolute values
                    if active_technique in ('PEIS', 'GEIS', 'EIS'):
                        import numpy as np
                        if 'z_' in _xcol:
                            _x_data = np.abs(_x_data)
                        if 'z_' in _ycol:
                            _y_data = np.abs(_y_data)

                    # Downsample if too many points (prevents huge plot output)
                    _max_points = 50000
                    _original_len = len(_x_data)
                    if _original_len > _max_points:
                        # Use ceiling division to ensure we get at most _max_points
                        _step = (_original_len + _max_points - 1) // _max_points
                        _x_data = _x_data[::_step]
                        _y_data = _y_data[::_step]
                        downsampled_files.append((_fname, _original_len, len(_x_data)))

                    # Apply time conversion if x column is time-based
                    if 'time' in _xcol.lower():
                        _x_data = _x_data * _time_factor

                    # Apply x-offset for time_order mode
                    if _plot_type == "time_order" and _i > 0:
                        _x_offset += _df[_xcol].max() * _time_factor
                        _x_data = _x_data + _x_offset

                    # Determine which axes to use
                    if _plot_type == "y_stacked" and _n > 1:
                        _xaxis_ref = f'x{_i + 1}' if _i > 0 else 'x'
                        _yaxis_ref = f'y{_i + 1}' if _i > 0 else 'y'
                    else:
                        _xaxis_ref = 'x'
                        _yaxis_ref = 'y'

                    chart_figure.add_trace(go.Scattergl(
                        x=_x_data, y=_y_data, mode=_mode, name=_lbl,
                        xaxis=_xaxis_ref, yaxis=_yaxis_ref,
                        line=dict(color=_colors[_i], width=_trace_lw),
                        marker=dict(color=_colors[_i], size=_marker_size, symbol=_marker_type)))

            _title = _v["plot_title"] if _v["plot_title"] else f"EC Data ({_n} files)"

            # Base axis style (shared by all axes)
            _axis_style = {
                'linecolor': 'black',
                'linewidth': _axis_lw,
                'ticks': 'inside',
                'tickwidth': _axis_lw,
                'showline': True,
                'showgrid': _grid,
                'gridcolor': 'lightgray',
                'gridwidth': 1,
                'griddash': 'dot',
                'mirror': True,
                'tickfont': {'size': _tick_fontsize},
            }

            # Parse axis bounds (empty string = auto)
            def _parse_bound(val):
                if val and val.strip():
                    try:
                        return float(val.strip())
                    except ValueError:
                        return None
                return None

            _x_min = _parse_bound(_v.get("x_min", ""))
            _x_max = _parse_bound(_v.get("x_max", ""))
            _y_min = _parse_bound(_v.get("y_min", ""))
            _y_max = _parse_bound(_v.get("y_max", ""))

            # Build axis range (None means auto)
            _x_range = None
            if _x_min is not None or _x_max is not None:
                _x_range = [_x_min, _x_max]
            _y_range = None
            if _y_min is not None or _y_max is not None:
                _y_range = [_y_min, _y_max]

            # Build layout
            _xaxis_config = {
                **_axis_style,
                'title': {'text': _x_label, 'font': {'size': _label_fontsize}},
                'type': _v["x_scale"],
            }
            if _x_range:
                _xaxis_config['range'] = _x_range

            _layout = {
                'plot_bgcolor': 'rgba(0, 0, 0, 0)',
                'font': {'family': 'Arial Black', 'size': 16},
                'title': {'text': _title, 'font': {'size': _title_fontsize}},
                'xaxis': _xaxis_config,
                'showlegend': _show_legend,
                'legend': _legend_config,
                'annotations': [],  # Explicitly clear any annotations
                'height': _v["plot_height"],
                'width': _v["plot_width"],
                'margin': {'l': 80 if not _hide_y_labels else 40, 'r': 150, 't': _top_margin, 'b': _bottom_margin},
                'hovermode': 'x unified',
            }

            # Configure axes (always clear annotations - not used)
            _layout['annotations'] = []

            if _plot_type == "y_stacked" and _n > 1:
                # Create separate x-axis and y-axis for each subplot
                _middle_idx = _n // 2  # Put y-label on middle subplot
                for _i in range(_n):
                    _xaxis_key = 'xaxis' if _i == 0 else f'xaxis{_i + 1}'
                    _yaxis_key = 'yaxis' if _i == 0 else f'yaxis{_i + 1}'
                    _yaxis_anchor = 'x' if _i == 0 else f'x{_i + 1}'
                    _xaxis_anchor = 'y' if _i == 0 else f'y{_i + 1}'

                    # X-axis: only bottom subplot (i=0) gets the title
                    _layout[_xaxis_key] = {
                        **_axis_style,
                        'type': _v["x_scale"],
                        'title': {'text': _x_label, 'font': {'size': _label_fontsize}} if _i == 0 else '',
                        'showticklabels': _i == 0,  # Only show tick labels on bottom
                        'anchor': _xaxis_anchor,
                        'matches': 'x' if _i > 0 else None,  # Sync with first x-axis
                    }
                    # Add x range to first axis only (others sync via matches)
                    if _i == 0 and _x_range:
                        _layout[_xaxis_key]['range'] = _x_range
                    # Remove None values
                    if _layout[_xaxis_key].get('matches') is None:
                        del _layout[_xaxis_key]['matches']

                    # Y-axis: put title on middle subplot only
                    _y_title = ''
                    if _i == _middle_idx and not _hide_y_labels:
                        _y_title = {'text': _y_label, 'font': {'size': _label_fontsize}}
                    _layout[_yaxis_key] = {
                        **_axis_style,
                        'type': _v["y_scale"],
                        'domain': _domains[_i],
                        'title': _y_title,
                        'showticklabels': not _hide_y_labels,
                        'anchor': _yaxis_anchor,
                    }
                    # Add y range to all y-axes in stacked mode
                    if _y_range:
                        _layout[_yaxis_key]['range'] = _y_range
            else:
                # Single y-axis for overlay/time_order
                _yaxis_config = {
                    **_axis_style,
                    'type': _v["y_scale"],
                    'title': {'text': _y_label, 'font': {'size': _label_fontsize}},
                }
                if _y_range:
                    _yaxis_config['range'] = _y_range
                _layout['yaxis'] = _yaxis_config

            chart_figure.update_layout(**_layout)
    return analysis_results, chart_figure, downsampled_files


@app.cell
def _(active_technique, analysis_results, ec_data, mo):
    # Analysis output display - shows technique-specific results below the plot
    analysis_output = None

    if analysis_results:
        _items = []

        # CA/CP: Time range averaging
        if 'averages' in analysis_results:
            _avgs = analysis_results['averages']
            _col = analysis_results['avg_column']
            _range = analysis_results['avg_range']
            _unit = 'mA' if 'mA' in _col else 'V'
            _label = 'Current' if active_technique == 'CA' else 'Voltage'

            _lines = [f"**Average {_label}** ({_range[0]:.1f}s - {_range[1]:.1f}s):"]
            for _fname, _avg in _avgs.items():
                _file_label = ec_data[_fname]['label'] if _fname in ec_data else _fname
                _lines.append(f"- {_file_label}: **{_avg:.4f} {_unit}**")
            _items.append(mo.md('\n'.join(_lines)))

        # PEIS: iR intercept
        if 'ir_intercepts' in analysis_results:
            _intercepts = analysis_results['ir_intercepts']
            _lines = ["**R_solution (HF intercept)**:"]
            for _fname, _ir in _intercepts.items():
                _file_label = ec_data[_fname]['label'] if _fname in ec_data else _fname
                _lines.append(f"- {_file_label}: **{_ir:.3f} \u03a9**")
            _items.append(mo.md('\n'.join(_lines)))

        # iR correction applied info
        if 'ir_correction' in analysis_results:
            _ir_info = analysis_results['ir_correction']
            _peis_label = ec_data[_ir_info['peis_file']]['label'] if _ir_info['peis_file'] in ec_data else _ir_info['peis_file']
            _items.append(mo.md(
                f"**iR Correction Applied:** R = **{_ir_info['resistance_ohm']:.3f} \u03a9** "
                f"(from {_peis_label})"
            ))

        if _items:
            analysis_output = mo.vstack(_items, gap=1)
    return (analysis_output,)


@app.cell
def _(analysis_output, chart_figure, chart_sidebar, go, mo, technique_tabs):
    # Combine sidebar and chart with technique tabs above plot
    # Show placeholder if no figure or figure has no traces
    _has_data = chart_figure is not None and len(chart_figure.data) > 0

    if _has_data:
        _display_chart = chart_figure
    else:
        _empty_fig = go.Figure()
        _empty_fig.update_layout(
            plot_bgcolor='rgba(240, 240, 240, 0.5)',
            height=500,
            width=800,
            xaxis={'visible': False},
            yaxis={'visible': False},
        )
        _display_chart = _empty_fig

    # Build the plot area with tabs above
    _plot_items = []
    if technique_tabs is not None:
        _plot_items.append(technique_tabs)
    _plot_items.append(_display_chart)
    if analysis_output is not None:
        _plot_items.append(analysis_output)

    _plot_area = mo.vstack(_plot_items, gap=1)

    if chart_sidebar is not None:
        chart_section = mo.hstack([chart_sidebar, _plot_area],
            justify="start", gap=2, align="start", widths=[1, 4])
    else:
        chart_section = mo.hstack([mo.md(""), _plot_area],
            justify="start", gap=2, align="start", widths=[1, 4])
    return (chart_section,)


@app.cell
def _(downsampled_files, mo):
    # Downsampling warning - displayed below metadata editor (compact single line)
    downsample_warning = None
    if downsampled_files:
        _n = len(downsampled_files)
        _total_orig = sum(x[1] for x in downsampled_files)
        _total_new = sum(x[2] for x in downsampled_files)
        downsample_warning = mo.md(
            f"*{_n} file{'s' if _n > 1 else ''} downsampled for display: "
            f"{_total_orig:,} → {_total_new:,} points (full data preserved in exports)*"
        )
    return (downsample_warning,)


@app.cell
def _(mo):
    # Export format selector
    export_format = mo.ui.radio(
        options={
            "Parquet + metadata (for Python / re-upload)": "parquet",
            "CSV (for Excel / other software)": "csv",
        },
        value="Parquet + metadata (for Python / re-upload)",  # Use key, not value
        label="Export Data As..."
    )
    return (export_format,)


@app.cell
def _(
    EchemDataset,
    chart_batch,
    csv_export,
    datetime,
    ec_data,
    export_format,
    file_metadata,
    file_selector,
    generate_plot_code,
    load_df,
    mo,
    session_export,
):
    # Export button - includes data and plot code in one zip
    export_button = None

    if ec_data:
        _timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        _chart_values = chart_batch.value if chart_batch is not None else {}
        _selected_files = list(file_selector.value) if file_selector is not None and file_selector.value else []
        _is_parquet = export_format.value == "parquet"
        _ext = ".parquet" if _is_parquet else ".csv"

        # Build EchemDataset objects from ec_data
        _datasets = []
        for _fname, _data in ec_data.items():
            _meta = file_metadata.get(_fname, {}) if file_metadata else {}
            _user_meta = {k: v for k, v in _meta.items() if k not in ('filename', 'label', 'technique')}
            _datasets.append(EchemDataset(
                filename=_fname,
                df=load_df(_data['df_path']),
                columns=_data.get('columns', []),
                technique=_meta.get('technique') or _data.get('technique'),
                label=_meta.get('label') or _data.get('label', _fname),
                timestamp=datetime.fromisoformat(_data['timestamp']) if _data.get('timestamp') else None,
                cycles=_data.get('cycles', []),
                source_format=_data.get('source'),
                original_filename=_data.get('path', _fname),
                user_metadata=_user_meta,
            ))

        # Build plot settings
        _plot_settings = {'selected_files': _selected_files}
        if _chart_values:
            _plot_settings['plot_settings'] = {k: _chart_values.get(k) for k in [
                'x_col', 'y_col', 'plot_type', 'time_unit', 'color_scheme',
                'line_mode', 'marker_type', 'marker_size', 'trace_linewidth',
                'axis_linewidth', 'x_scale', 'y_scale', 'show_grid', 'show_legend',
                'legend_source', 'legend_position', 'legend_fontsize', 'plot_height',
                'plot_width', 'plot_title', 'x_label', 'y_label', 'title_fontsize',
                'label_fontsize', 'tick_fontsize', 'stacked_gap', 'hide_y_labels',
            ]}

        # Generate plot code with correct file paths for chosen format
        _plot_code = None
        if _chart_values and _selected_files:
            _files_for_codegen = [
                {
                    "path": f"data/{_fname}{_ext}",
                    "label": (file_metadata.get(_fname, {}) if file_metadata else {}).get(
                        'label', _fname.replace('.mpr', '').replace('.dta', ''))
                }
                for _fname in _selected_files
            ]
            _plot_code = generate_plot_code(_chart_values, _files_for_codegen)

        # Export with data and plot code
        if _is_parquet:
            _zip_bytes = session_export(_datasets, plot_settings=_plot_settings, plot_code=_plot_code)
            export_button = mo.download(
                data=_zip_bytes,
                filename=f"echem_session_{_timestamp}.zip",
                label="Export Data"
            )
        else:
            _zip_bytes = csv_export(_datasets, plot_settings=_plot_settings, plot_code=_plot_code)
            export_button = mo.download(
                data=_zip_bytes,
                filename=f"echem_csv_{_timestamp}.zip",
                label="Export Data"
            )
    return (export_button,)


@app.cell
def _(
    chart_section,
    downsample_warning,
    export_button,
    export_format,
    metadata_editor,
    mo,
    mpr_upload,
    session_upload,
):
    # Main layout - combines all UI components
    # Build data upload section content
    _upload_items = [
        mo.hstack([mpr_upload, session_upload], justify="start", gap=2),
        metadata_editor if metadata_editor is not None else mo.md("*No files loaded. Upload .mpr files or import a previous session.*"),
    ]
    if downsample_warning is not None:
        _upload_items.append(downsample_warning)
    _upload_content = mo.vstack(_upload_items, gap=2)

    # Build export section content
    if export_button is not None:
        _export_content = mo.vstack([
            export_format,
            export_button,
        ], gap=2)
    else:
        _export_content = mo.md("*Upload data to enable export*")

    mo.vstack([
        mo.md("# Electrochemistry Data Viewer"),

        # Data Upload section
        mo.md("## 📁 Data Upload"),
        _upload_content,

        # Chart Builder section
        mo.md("## 📊 Chart Builder"),
        chart_section,

        # Export section
        mo.md("## 💾 Export Data"),
        _export_content,
    ], gap=2)
    return


@app.cell
def _():
    return


if __name__ == "__main__":
    app.run()
