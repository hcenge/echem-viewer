# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "marimo",
#     "galvani",
#     "polars",
#     "plotly",
#     "altair",
#     "pandas",
#     "pyarrow",
# ]
# ///

import marimo

__generated_with = "0.19.4"
app = marimo.App(width="full")


@app.cell
def _():
    import marimo as mo
    import polars as pl
    import pandas as pd
    import plotly.graph_objects as go
    import plotly.express as px
    from galvani import BioLogic
    import io
    import json
    import zipfile
    import re
    import tempfile
    import os
    from pathlib import Path
    from datetime import datetime
    return (
        BioLogic,
        Path,
        datetime,
        go,
        io,
        json,
        mo,
        os,
        pl,
        px,
        re,
        tempfile,
        zipfile,
    )


@app.cell
def _():
    # Base style dictionary for all EC plots
    base_style_dict = {
        'plot_bgcolor': 'rgba(0, 0, 0, 0)',
        'font': {'family': 'Arial Black', 'size': 16},
        'xaxis': {
            'linecolor': 'black',
            'linewidth': 4,
            'ticks': 'inside',
            'tickwidth': 4,
            'mirror': True,
            'showline': True,
            'showgrid': True,
            'gridcolor': 'lightgray',
            'gridwidth': 1,
            'griddash': 'dot',
        },
        'yaxis': {
            'linecolor': 'black',
            'linewidth': 4,
            'ticks': 'inside',
            'tickwidth': 4,
            'mirror': True,
            'showline': True,
            'showgrid': True,
            'gridcolor': 'lightgray',
            'gridwidth': 1,
            'griddash': 'dot',
        },
        'legend': {
            'orientation': 'v',
            'yanchor': 'top',
            'y': 1,
            'xanchor': 'left',
            'x': 1.02
        },
    }
    return


@app.cell
def _():
    # Map full technique names from Biologic to abbreviations
    TECHNIQUE_MAP = {
        'Chronoamperometry / Chronocoulometry': 'CA',
        'Chronoamperometry': 'CA',
        'Chronocoulometry': 'CC',
        'Chronopotentiometry': 'CP',
        'Cyclic Voltammetry': 'CV',
        'Linear Sweep Voltammetry': 'LSV',
        'Open Circuit Voltage': 'OCV',
        'Open Circuit Potential': 'OCP',
        'Potentio Electrochemical Impedance Spectroscopy': 'PEIS',
        'Galvano Electrochemical Impedance Spectroscopy': 'GEIS',
        'Impedance Spectroscopy': 'EIS',
        'Constant Current': 'CC',
        'Constant Voltage': 'CV',
        'IR compensation (PEIS)': 'ZIR',
    }
    return (TECHNIQUE_MAP,)


@app.cell
def _(TECHNIQUE_MAP, re):
    def extract_technique_from_filename(filename: str) -> str | None:
        """Extract technique abbreviation from .mpr filename."""
        base = filename.replace('.mpr', '')
        base = re.sub(r'_C\d+$', '', base)

        # Multi-scan pattern: _XX_TECHNIQUE at end
        match = re.search(r'_(\d{2})_([A-Z]+)$', base)
        if match:
            technique = match.group(2)
            if technique in TECHNIQUE_MAP.values():
                return technique

        # Single scan: technique at start or anywhere
        for abbrev in TECHNIQUE_MAP.values():
            if base.startswith(abbrev + '_') or base == abbrev:
                return abbrev

        parts = base.split('_')
        for part in parts:
            if part in TECHNIQUE_MAP.values():
                return part

        return None

    def extract_label_from_filename(filename: str) -> str:
        """Extract a clean label from .mpr filename."""
        base = filename.replace('.mpr', '')
        label = re.sub(r'_C\d+$', '', base)
        label = re.sub(r'_\d{2}_[A-Z]+$', '', label)
        return label
    return extract_label_from_filename, extract_technique_from_filename


@app.cell
def _(
    BioLogic,
    Path,
    extract_label_from_filename,
    extract_technique_from_filename,
    os,
    pl,
    tempfile,
):
    def process_files_from_dict(files_dict: dict) -> dict:
        """Process a dict of {path: bytes} containing .mpr files."""
        ec_data = {}

        for fpath, content in files_dict.items():
            if not fpath.endswith('.mpr'):
                continue

            filename = Path(fpath).name

            try:
                with tempfile.NamedTemporaryFile(suffix='.mpr', delete=False) as tmp:
                    tmp.write(content)
                    tmp_path = tmp.name

                try:
                    mpr_data = BioLogic.MPRfile(tmp_path)
                    data_dict = {col: mpr_data.data[col] for col in mpr_data.data.dtype.names}
                    df = pl.DataFrame(data_dict)

                    timestamp = None
                    if hasattr(mpr_data, 'timestamp') and mpr_data.timestamp:
                        timestamp = mpr_data.timestamp.isoformat()

                    label = extract_label_from_filename(filename)
                    technique = extract_technique_from_filename(filename)

                    ec_data[filename] = {
                        'path': fpath,
                        'filename': filename,
                        'label': label,
                        'timestamp': timestamp,
                        'df': df,
                        'columns': list(df.columns),
                        'technique': technique,
                    }
                finally:
                    os.unlink(tmp_path)

            except Exception as e:
                print(f"Error processing {filename}: {e}")

        return ec_data
    return (process_files_from_dict,)


@app.cell
def _(mo):
    # File upload widgets
    mpr_upload = mo.ui.file(
        kind="area",
        filetypes=[".mpr"],
        multiple=True,
        label="Drop .mpr files here"
    )

    session_upload = mo.ui.file(
        kind="button",
        filetypes=[".zip"],
        multiple=False,
        label="Import previous session"
    )
    return mpr_upload, session_upload


@app.cell
def _(
    io,
    json,
    mpr_upload,
    pl,
    process_files_from_dict,
    session_upload,
    zipfile,
):
    # Process uploaded files
    ec_data = {}

    if session_upload.value:
        try:
            zip_bytes = session_upload.value[0].contents
            with zipfile.ZipFile(io.BytesIO(zip_bytes), 'r') as zf:
                metadata = json.loads(zf.read('metadata.json').decode('utf-8'))
                for file_info in metadata['files']:
                    parquet_name = file_info['parquet_name']
                    df = pl.read_parquet(io.BytesIO(zf.read(parquet_name)))
                    ec_data[file_info['filename']] = {
                        'path': file_info.get('path', file_info['filename']),
                        'filename': file_info['filename'],
                        'label': file_info.get('label', file_info['filename']),
                        'timestamp': file_info.get('timestamp'),
                        'df': df,
                        'columns': list(df.columns),
                        'technique': file_info.get('technique'),
                    }
        except Exception as e:
            print(f"Error importing session: {e}")

    elif mpr_upload.value:
        files_dict = {}
        for f in mpr_upload.value:
            files_dict[f.name] = f.contents
        ec_data = process_files_from_dict(files_dict)
    return (ec_data,)


@app.cell
def _(ec_data, mo):
    # Technique filter - separate cell so file_selector can react to changes
    technique_filter = None

    if ec_data:
        _techniques = set()
        for _info in ec_data.values():
            if _info.get('technique'):
                _techniques.add(_info['technique'])

        if _techniques:
            technique_filter = mo.ui.multiselect(
                options=sorted(_techniques),
                label="Filter by technique",
                value=[]
            )
    return (technique_filter,)


@app.cell
def _(ec_data, mo, technique_filter):
    # File selector - reactive to technique_filter
    file_selector = None

    if ec_data:
        # Get selected techniques (empty means show all)
        _selected_techniques = []
        if technique_filter is not None and technique_filter.value:
            _selected_techniques = technique_filter.value

        # Build file options, filtering by technique if specified
        _file_options = {}
        for _fname, _info in ec_data.items():
            # Skip if technique filter is active and file doesn't match
            if _selected_techniques and _info.get('technique') not in _selected_techniques:
                continue

            _tech = f" [{_info['technique']}]" if _info.get('technique') else ""
            _display = f"{_info['label']}{_tech}"
            _file_options[_display] = _fname

        file_selector = mo.ui.multiselect(
            options=_file_options,
            label="Select files to plot",
            value=list(_file_options.keys())[:5] if _file_options else []
        )
    return (file_selector,)


@app.cell
def _(ec_data, file_metadata, file_selector, mo):
    # Chart builder with mo.ui.dictionary for proper reactivity
    chart_batch = None

    if ec_data and file_selector is not None and file_selector.value:
        _first_file = file_selector.value[0]
        if _first_file in ec_data:
            _columns = ec_data[_first_file]['columns']
            _columns_with_none = ["(none)"] + _columns

            # Escape column names for display (< and > get interpreted as HTML)
            def _escape(s):
                return s.replace('<', '‹').replace('>', '›')
            _col_options = {_escape(c): c for c in _columns}
            _col_options_none = {"(none)": "(none)", **{_escape(c): c for c in _columns}}

            # Smart defaults
            _x_default = 'time/s' if 'time/s' in _columns else _columns[0]
            _y_default = None
            for _col in ['<I>/mA', 'I/mA', '<I>/A', 'I/A', 'Ewe/V']:
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
            # Add any custom columns from file_metadata (excluding protected fields)
            if file_metadata:
                _first_meta = next(iter(file_metadata.values()), {})
                for _key in _first_meta.keys():
                    if _key not in ['filename', 'label', 'technique']:
                        # Capitalize for display
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
                "y_col": mo.ui.dropdown(options=_col_options, value=_escape(_y_default), label="Y column (primary)"),
                "y2_col": mo.ui.dropdown(options=_col_options_none, value="(none)", label="Y column (secondary)"),
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
                "show_grid": mo.ui.checkbox(value=True, label="Show grid"),
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
    return (chart_batch,)


@app.cell
def _(chart_batch, file_selector, mo, technique_filter):
    # Sidebar UI - always visible, shows placeholder when no data
    # Always show file_selector when data is loaded (even if no files selected)
    if file_selector is not None:
        # Build data section items (file selection)
        _data_items = []
        if technique_filter is not None:
            _data_items.append(technique_filter)
        _data_items.append(file_selector)

        # Add chart_batch controls if available (requires files to be selected)
        if chart_batch is not None:
            # Add column selectors to data section
            _data_items.extend([
                chart_batch["x_col"], chart_batch["y_col"], chart_batch["y2_col"],
                chart_batch["time_unit"],
            ])

            # Plot type items - show stacked options only for y_stacked mode
            _plot_type_items = [chart_batch["plot_type"]]
            if chart_batch["plot_type"].value == "y_stacked":
                _plot_type_items.extend([
                    chart_batch["stacked_gap"],
                    chart_batch["hide_y_labels"],
                ])

            # Build appearance items based on mode
            _appearance_items = [
                chart_batch["color_scheme"],
                chart_batch["line_mode"],
                chart_batch["axis_linewidth"],
            ]
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
                    "**Axes**": mo.vstack([chart_batch["x_scale"], chart_batch["y_scale"], chart_batch["show_grid"]]),
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
def _(ec_data, metadata_editor):
    # Build file_metadata dict from edited data_editor values (reactive to edits)
    # Protected fields (filename, label, technique) always come from ec_data
    # User-editable fields (legend, custom columns) come from editor
    file_metadata = {}

    if metadata_editor is not None and ec_data:
        _edited_data = metadata_editor.value  # List of dicts from data_editor
        if _edited_data is not None and len(_edited_data) > 0:
            for _row in _edited_data:
                _fname = _row['filename']
                if _fname in ec_data:
                    _source = ec_data[_fname]
                    # Start with all edited values (including custom columns)
                    _meta = dict(_row)
                    # Override protected fields from original source
                    _meta['filename'] = _fname
                    _meta['label'] = _source.get('label', _fname)
                    _meta['technique'] = _source.get('technique', '')
                    file_metadata[_fname] = _meta
    return (file_metadata,)


@app.cell
def _(chart_batch, ec_data, file_metadata, file_selector, go, px):
    # Chart figure - rebuilds when values change (uses Scattergl for performance)
    chart_figure = None

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
            _y2col = _v["y2_col"] if _v["y2_col"] != "(none)" else None
            _mode = _v["line_mode"]
            _grid = _v["show_grid"]
            _time_unit = _v.get("time_unit", "s")
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
            # For time columns, update the label to reflect the selected unit
            _x_label_default = _escape(_xcol)
            if 'time' in _xcol.lower() and '/s' in _xcol:
                _x_label_default = _x_label_default.replace('/s', f'/{_time_label_suffix}')
            _x_label = _v.get("x_label", "") or _x_label_default
            _y_label = _v.get("y_label", "") or _escape(_ycol)

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

            for _i, _fname in enumerate(_selected):
                _data = ec_data[_fname]
                _df = _data['df']

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

                # Secondary y-axis (only for overlay/time_order modes)
                if _y2col and _plot_type != "y_stacked" and _xcol in _df.columns and _y2col in _df.columns:
                    _x_data2 = _df[_xcol].to_numpy().copy()
                    _y_data2 = _df[_y2col].to_numpy().copy()
                    # Apply time conversion if x column is time-based
                    if 'time' in _xcol.lower():
                        _x_data2 = _x_data2 * _time_factor
                    if _plot_type == "time_order" and _i > 0:
                        _x_data2 = _x_data2 + _x_offset
                    chart_figure.add_trace(go.Scattergl(
                        x=_x_data2, y=_y_data2, mode=_mode,
                        name=f"{_lbl} ({_escape(_y2col)})", yaxis='y2',
                        line=dict(color=_colors[_i], width=_trace_lw, dash='dash'),
                        marker=dict(color=_colors[_i], size=_marker_size, symbol='diamond')))

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

            # Build layout
            _layout = {
                'plot_bgcolor': 'rgba(0, 0, 0, 0)',
                'font': {'family': 'Arial Black', 'size': 16},
                'title': {'text': _title, 'font': {'size': _title_fontsize}},
                'xaxis': {
                    **_axis_style,
                    'title': {'text': _x_label, 'font': {'size': _label_fontsize}},
                    'type': _v["x_scale"],
                },
                'showlegend': _show_legend,
                'legend': _legend_config,
                'annotations': [],  # Explicitly clear any annotations
                'height': _v["plot_height"],
                'width': _v["plot_width"],
                'margin': {'l': 80 if not _hide_y_labels else 40, 'r': 150, 't': _top_margin, 'b': _bottom_margin},
                'hovermode': 'x unified',
            }

            # Configure axes
            if _plot_type == "y_stacked" and _n > 1:
                # Create separate x-axis and y-axis for each subplot
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
                    # Remove None values
                    if _layout[_xaxis_key].get('matches') is None:
                        del _layout[_xaxis_key]['matches']

                    # Y-axis (no individual titles - use centered annotation instead)
                    _layout[_yaxis_key] = {
                        **_axis_style,
                        'type': _v["y_scale"],
                        'domain': _domains[_i],
                        'title': '',
                        'showticklabels': not _hide_y_labels,
                        'anchor': _yaxis_anchor,
                    }

                # Add centered y-axis label as annotation for stacked plots
                if not _hide_y_labels:
                    _layout['annotations'] = [{
                        'text': _y_label,
                        'xref': 'paper',
                        'yref': 'paper',
                        'x': -0.15,
                        'y': 0.5,
                        'showarrow': False,
                        'textangle': -90,
                        'font': {'size': _label_fontsize},
                    }]
                    # Increase left margin for stacked y-label annotation
                    _layout['margin']['l'] = 120
            else:
                # Single y-axis for overlay/time_order
                _layout['yaxis'] = {
                    **_axis_style,
                    'type': _v["y_scale"],
                    'title': {'text': _y_label, 'font': {'size': _label_fontsize}},
                }
                # Secondary y-axis if needed
                if _y2col:
                    _layout['yaxis2'] = {
                        **_axis_style,
                        'title': {'text': _escape(_y2col), 'font': {'size': _label_fontsize}},
                        'type': _v["y_scale"],
                        'overlaying': 'y',
                        'side': 'right',
                        'showgrid': False,
                    }

            chart_figure.update_layout(**_layout)
    return (chart_figure,)


@app.cell
def _(chart_figure, chart_sidebar, go, mo):
    # Combine sidebar and chart - always show chart area
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

    if chart_sidebar is not None:
        chart_section = mo.hstack([chart_sidebar, _display_chart],
            justify="start", gap=2, align="start", widths=[1, 4])
    else:
        chart_section = mo.hstack([mo.md(""), _display_chart],
            justify="start", gap=2, align="start", widths=[1, 4])
    return (chart_section,)


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
    chart_batch,
    datetime,
    ec_data,
    export_format,
    file_metadata,
    file_selector,
    io,
    json,
    mo,
    pl,
    zipfile,
):
    # Export button - changes based on format selection
    export_button = None

    if ec_data:
        _zip_buffer = io.BytesIO()
        _timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        _chart_values = chart_batch.value if chart_batch is not None else {}

        if export_format.value == "parquet":
            # Parquet export with metadata
            with zipfile.ZipFile(_zip_buffer, 'w', zipfile.ZIP_DEFLATED) as _zf:
                _metadata = {
                    'exported_at': datetime.now().isoformat(),
                    'files': [],
                    'ui_state': {
                        'selected_files': list(file_selector.value) if file_selector is not None and file_selector.value else [],
                        'x_column': _chart_values.get("x_col"),
                        'y_column': _chart_values.get("y_col"),
                    }
                }

                for _fname, _data in ec_data.items():
                    _parquet_name = _fname.replace('.mpr', '.parquet')
                    _parquet_buf = io.BytesIO()
                    _data['df'].write_parquet(_parquet_buf)
                    _zf.writestr(_parquet_name, _parquet_buf.getvalue())

                    # Build file metadata entry, merging ec_data defaults with edited file_metadata
                    _file_entry = {
                        'filename': _fname,
                        'parquet_name': _parquet_name,
                        'path': _data.get('path', _fname),
                        'label': _data.get('label', _fname),
                        'timestamp': _data.get('timestamp'),
                        'technique': _data.get('technique'),
                    }
                    # Add any custom columns from file_metadata editor
                    if file_metadata and _fname in file_metadata:
                        for _key, _val in file_metadata[_fname].items():
                            if _key not in _file_entry:
                                _file_entry[_key] = _val
                    _metadata['files'].append(_file_entry)

                _zf.writestr('metadata.json', json.dumps(_metadata, indent=2))

            export_button = mo.download(
                data=_zip_buffer.getvalue(),
                filename=f"echem_session_{_timestamp}.zip",
                label="Export"
            )
        else:
            # CSV export with metadata.csv
            with zipfile.ZipFile(_zip_buffer, 'w', zipfile.ZIP_DEFLATED) as _zf:
                # Export data files
                for _fname, _data in ec_data.items():
                    _csv_name = _fname.replace('.mpr', '.csv')
                    _csv_content = _data['df'].write_csv()
                    _zf.writestr(_csv_name, _csv_content)

                # Export metadata.csv with all file metadata
                _meta_rows = []
                for _fname, _data in ec_data.items():
                    _row = {
                        'filename': _fname,
                        'label': _data.get('label', _fname),
                        'technique': _data.get('technique', ''),
                        'timestamp': _data.get('timestamp', ''),
                    }
                    # Add any custom columns from file_metadata editor
                    if file_metadata and _fname in file_metadata:
                        for _key, _val in file_metadata[_fname].items():
                            if _key not in _row:
                                _row[_key] = _val if _val is not None else ''
                    _meta_rows.append(_row)

                if _meta_rows:
                    _meta_df = pl.DataFrame(_meta_rows)
                    _zf.writestr('metadata.csv', _meta_df.write_csv())

            export_button = mo.download(
                data=_zip_buffer.getvalue(),
                filename=f"echem_csv_{_timestamp}.zip",
                label="Export"
            )
    return (export_button,)


@app.cell
def _(
    chart_section,
    export_button,
    export_format,
    metadata_editor,
    mo,
    mpr_upload,
    session_upload,
):
    # Main layout - combines all UI components
    # Build data upload section content
    _upload_content = mo.vstack([
        mo.hstack([mpr_upload, session_upload], justify="start", gap=2),
        metadata_editor if metadata_editor is not None else mo.md("*No files loaded. Upload .mpr files or import a previous session.*"),
    ], gap=2)

    # Build export section content
    _export_content = mo.vstack([
        mo.hstack([export_format, export_button], justify="start", gap=2, align="end") if export_button is not None else mo.md("*Upload data to enable export*"),
    ], gap=2)

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
