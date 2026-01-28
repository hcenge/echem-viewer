# Echem-Viewer Architecture Specification

**Status**: Complete
**Date**: 2026-01-19

---

## Overview

This document specifies the backend/frontend separation for echem-viewer, designed for:
1. Swappable frontends (marimo now, FastAPI + JS later)
2. Reusable backend as a standalone library
3. Sharing components with other projects

---

## 1. Package Structure

```
echem-viewer/
├── echem_core/
│   ├── __init__.py               # Public API exports
│   ├── types.py                  # Dataclasses (EchemDataset, etc.)
│   ├── parsers/
│   │   ├── __init__.py           # load_file() entry point, auto-detection
│   │   ├── biologic.py           # BioLogic .mpr parsing
│   │   └── gamry.py              # Gamry .dta parsing
│   ├── analysis/
│   │   ├── __init__.py           # Common exports
│   │   ├── common.py             # General utilities (get_time_range, etc.)
│   │   ├── eis.py                # EIS/PEIS analysis
│   │   ├── ca.py                 # CA analysis
│   │   ├── cv.py                 # CV analysis
│   │   └── ...                   # Other techniques as needed
│   ├── transforms.py             # General column math (normalize, formulas)
│   ├── export.py                 # Session export/import
│   ├── codegen.py                # Python code generation
│   └── storage.py                # Data storage management
├── app.py                        # Frontend (marimo) - UI only
├── ARCHITECTURE_SPEC.md          # This document
└── pyproject.toml
```

**Decisions:**
- Single package (`echem_core/`) with nested subpackages for parsers and analysis
- Module functions (stateless) — FastAPI-friendly, easy to import selectively
- Backend has no frontend dependencies (no marimo, no plotly)
- Adding new file formats = add new module in `parsers/`
- Adding technique-specific analysis = add new module in `analysis/`

---

## 2. Data Models (`types.py`)

**Decisions:**
- Python dataclasses (stdlib, typed, minimal overhead)
- DataFrame library: Polars (committed, compatible with plotly via `.to_numpy()`)

### EchemDataset

Represents a single electrochemistry measurement file:

```python
from dataclasses import dataclass, field
from datetime import datetime
import polars as pl

@dataclass
class EchemDataset:
    # Identity
    filename: str                              # Original filename

    # Data (always SI units, encoded in column names)
    df: pl.DataFrame                           # The measurement data
    columns: list[str]                         # Column names (e.g., current_A, potential_V)

    # Metadata
    technique: str | None = None               # CA, CV, PEIS, etc.
    label: str | None = None                   # User-editable label
    timestamp: datetime | None = None          # Measurement timestamp
    cycles: list[int] = field(default_factory=list)

    # Provenance
    source_format: str | None = None           # 'biologic' or 'gamry'
    original_filename: str | None = None       # Before any rename
    file_hash: str | None = None               # SHA256 of original file (future)

    # User-defined fields
    user_metadata: dict = field(default_factory=dict)
```

### Usage

```python
dataset = load_file("sample.mpr")
print(dataset.filename)       # "sample.mpr"
print(dataset.technique)      # "CA"
print(dataset.columns)        # ["time_s", "current_A", "potential_V", "cycle"]
print(dataset.df["current_A"].head(3))  # [0.0005, 0.0006, 0.0007] (always Amps)
```

### SI Unit Convention

All data stored in SI base units. Column names encode the unit:

| Column name | Unit | Description |
|-------------|------|-------------|
| `time_s` | seconds | Elapsed time |
| `potential_V` | volts | Working electrode potential |
| `current_A` | amperes | Current |
| `z_real_Ohm` | ohms | Real impedance |
| `z_imag_Ohm` | ohms | Imaginary impedance |
| `z_mag_Ohm` | ohms | Impedance magnitude |
| `z_phase_deg` | degrees | Impedance phase |
| `frequency_Hz` | hertz | Frequency |
| `cycle` | - | Cycle index (integer) |

Frontend is responsible for display conversion (e.g., A → mA).

---

## 3. Parsers (`parsers/`)

**Decisions:**
- Parsers convert to SI units immediately
- Column names standardized (see SI Unit Convention above)
- Return type: EchemDataset dataclass directly

### Public API (`parsers/__init__.py`)

```python
def load_file(file_path: str) -> EchemDataset:
    """
    Load electrochemistry file (auto-detects format by extension).

    - .mpr → BioLogic
    - .dta → Gamry

    Data is converted to SI units with standardized column names.
    """

def load_file_bytes(content: bytes, filename: str) -> EchemDataset:
    """Load from bytes (for web uploads)."""
```

### Format-Specific Modules

Each parser is responsible for:
1. Reading raw file format
2. Converting to SI units (e.g., BioLogic mA → A)
3. Renaming columns to standard names
4. Detecting technique
5. Extracting timestamp and other metadata

**`parsers/biologic.py`:**
- Reads .mpr via galvani library
- Converts current: mA → A (÷1000)
- Maps columns: `<I>/mA` → `current_A`, `Ewe/V` → `potential_V`, etc.

**`parsers/gamry.py`:**
- Reads .dta text format
- Current already in A (no conversion needed)
- Maps columns: `Im` → `current_A`, `Vf` → `potential_V`, etc.

### Adding New Formats

To add support for a new format (e.g., CH Instruments):

1. Create `parsers/chinstruments.py`
2. Implement `read_chi_file(path) -> EchemDataset`
3. Add extension detection in `parsers/__init__.py`

---

## 4. Transforms (`transforms.py`)

**Decisions:**
- General transforms that apply across multiple techniques
- Functions return modified EchemDataset
- Technique-specific analysis goes in `analysis/` instead

### Function Tree

```python
# --- Reference Electrode ---
REFERENCE_ELECTRODES = {
    "SHE": 0.0,
    "Ag/AgCl (sat. KCl)": 0.197,
    "Ag/AgCl (3M KCl)": 0.210,
    "SCE": 0.244,
    "Hg/HgO (1M NaOH)": 0.140,
    "Hg/HgO (1M KOH)": 0.098,
    # ... more references
}

def adjust_potential(dataset, offset_V, column="potential_V") -> EchemDataset:
    """Shift potential by fixed offset (V_new = V + offset)."""

def convert_reference(dataset, from_ref, to_ref, column="potential_V") -> EchemDataset:
    """Convert potential between reference electrode systems."""

# --- iR Compensation ---
def ir_compensate(dataset, resistance_ohm, v_col="potential_V", i_col="current_A") -> EchemDataset:
    """Correct potential for solution resistance (V_corrected = V - I×R)."""

# --- Normalization ---
def normalize_by_area(dataset, area_cm2, column="current_A") -> EchemDataset:
    """Add current_density_A_cm2 column (I / area)."""

def normalize_by_mass(dataset, mass_g, column="current_A") -> EchemDataset:
    """Add mass-normalized current column (I / mass)."""

# --- Display Performance ---
def downsample(df, max_points=50000, method="stride") -> pl.DataFrame:
    """Reduce points for display. Methods: 'stride' (every Nth), 'lttb' (future)."""
```

### Future Additions

- `smooth(method, window)` — moving average, Savitzky-Golay filter
- `interpolate(new_x)` — resample to new x values
- `baseline_subtract(baseline_df)` — subtract background measurement

### Note on Integration

For charge integration (∫I dt), use numpy/scipy directly in analysis functions rather than wrapping.

---

## 5. Analysis (`analysis/`)

**Philosophy:**
- Do complex single-file analysis in instrument software (EC-Lab, Gamry Echem Analyst)
- This tool focuses on: multi-file comparison, cross-instrument data, batch extraction
- Keep analysis functions minimal; prioritize what instrument software does poorly

### Distinction from Transforms

| Transforms | Analysis |
|------------|----------|
| Modifies/adds columns | Extracts values/results |
| Returns EchemDataset | Returns numbers, fit objects |
| Cross-technique | Technique-specific |

### Structure

```
analysis/
├── __init__.py
├── ca.py            # Chronoamperometry
├── cp.py            # Chronopotentiometry
├── cv.py            # Cyclic Voltammetry
├── lsv.py           # Linear Sweep Voltammetry
├── eis.py           # Impedance Spectroscopy
└── ocv.py           # Open Circuit
```

### analysis/ca.py — Chronoamperometry

```python
calculate_time_average(df, column, t_start, t_end)  # Steady-state current ✓
calculate_charge(df)                                 # Total charge Q = ∫I dt
assess_stability(df, window_size)                    # Current retention %, drift rate
# Future: cottrell_fit() - leave to instrument software for now
```

### analysis/cp.py — Chronopotentiometry

```python
calculate_time_average(df, column, t_start, t_end)  # Steady-state potential
find_transition_time(df)                             # τ from Sand equation
assess_stability(df, window_size)                    # Potential drift/decay
overpotential_at_current(df, target_current_A)       # Benchmark at fixed current density
```

### analysis/cv.py — Cyclic Voltammetry

```python
onset_potential(df, threshold_current_A)             # For overpotential calculation
# Future: find_peaks(), peak_separation(), scan_rate_analysis() - instrument software does well
```

### analysis/lsv.py — Linear Sweep Voltammetry

```python
onset_potential(df, threshold_current_A)             # Where reaction begins
limiting_current(df)                                 # Mass-transport plateau
current_at_potential(df, potential_V)                # Extract value for multi-file comparison
# Future: tafel_slope() - instrument software does well
```

### analysis/eis.py — Impedance Spectroscopy

```python
find_hf_intercept(df)                                # R_solution from Nyquist ✓
find_lf_intercept(df)                                # R_total from Nyquist ✓
# Circuit fitting: use dedicated tools (ZView, impedance.py, etc.)
```

### analysis/ocv.py — Open Circuit

```python
steady_state_potential(df, window_s)                 # Final equilibrium value
```

### Required Columns by Technique

| Technique | Required Columns | Optional |
|-----------|------------------|----------|
| CA | `time_s`, `current_A` | `potential_V`, `cycle` |
| CP | `time_s`, `potential_V` | `current_A`, `cycle` |
| CV | `potential_V`, `current_A` | `time_s`, `cycle` |
| LSV | `potential_V`, `current_A` | `time_s` |
| OCV | `time_s`, `potential_V` | - |
| PEIS/GEIS | `frequency_Hz`, `z_real_Ohm`, `z_imag_Ohm` | `z_mag_Ohm`, `z_phase_deg` |

---

## 6. Export/Import (`export.py`)

**Decisions:**
- Dedicated module
- Filter first, export second
- Comprehensive export: data + plot image + plot code

### Export Package Contents

```
export.zip/
├── metadata.json          # File metadata, schema version, provenance
├── ui_state.json          # Plot settings, selections
├── data/
│   ├── file1.parquet      # Always included (for re-import)
│   ├── file2.parquet
│   ├── file1.csv          # Optional (for Excel users)
│   └── file2.csv
├── plot.png               # Current plot as image
└── plot_code.py           # Standalone Python script to recreate plot
```

### Public API

```python
def export_session(
    datasets: list[EchemDataset],
    output_path: str,
    plot_figure: go.Figure | None = None,
    plot_settings: dict | None = None,
    include_csv: bool = False
) -> None:
    """
    Export datasets to zip file.

    Args:
        datasets: Datasets to export (caller filters beforehand)
        output_path: Output .zip path
        plot_figure: Plotly figure to save as PNG and generate code for
        plot_settings: Plot configuration (for ui_state.json and code generation)
        include_csv: Also export CSV versions of data files
    """

def export_session_bytes(...) -> bytes:
    """Export to bytes (for web download)."""

def import_session(zip_path: str) -> tuple[list[EchemDataset], dict | None]:
    """
    Import session from zip file.

    Returns:
        Tuple of (datasets, ui_state or None)
    """

def import_session_bytes(content: bytes) -> tuple[list[EchemDataset], dict | None]:
    """Import from bytes (for web upload)."""
```

### Note on Plot Image

Generating PNG requires `kaleido` package (plotly's static image export). This is an optional dependency — if not installed, export proceeds without the image.

### 6.1 Export File Format

#### Schema Versioning

- **Version scheme**: Semantic versioning (MAJOR.MINOR.PATCH)
- **Compatibility**: Forward-compatible (ignore unknown fields)
- **Current version**: 1.0.0

#### metadata.json Structure

```json
{
  "schema_version": "1.0.0",
  "format": "echem-viewer-export",
  "exported_at": "2026-01-19T14:30:00Z",
  "export_info": {
    "echem_viewer_version": "0.1.0",
    "export_scope": "full_session"
  },
  "files": [
    {
      "filename": "CA_sample1.mpr",
      "parquet_path": "data/CA_sample1.parquet",
      "technique": "CA",
      "timestamp": "2026-01-19T10:15:30Z",
      "label": "Sample 1 - 1.0V hold",
      "columns": ["time_s", "current_A", "potential_V", "cycle"],
      "provenance": {
        "original_filename": "CA_sample1.mpr",
        "source_format": "biologic",
        "file_hash": null
      },
      "user_metadata": {}
    }
  ],
  "validation_warnings": []
}
```

#### Validation

- Export validates required columns per technique (see Section 5)
- Warnings recorded in `validation_warnings` array
- Export proceeds regardless — warnings are informational

### 6.2 Multi-Technique Coordination (Future)

#### Current State

- Separate viewer apps for each technique (echem, XAS, XRD)
- Manual spreadsheet tracks what was measured when
- Each app exports in its own format

#### Design Goal

All technique viewers export in **compatible formats**:
- Same structure: `data/`, `metadata.json`, `ui_state.json`, `plot.png`, `plot_code.py`
- Same metadata fields: `filename`, `timestamp`, `technique`, `provenance`
- Compatible timestamps (ISO 8601) for correlation

#### Future: Coordinator Tool

A separate CLI/app that:
1. Imports exports from each technique viewer
2. Uses timestamps/filenames to suggest matches
3. Allows manual correction (spreadsheet is sometimes incomplete)
4. Generates unified dataset with linked measurements

#### For Now

- Ensure echem-viewer export format is well-documented
- Include timestamps and clear identifiers
- Design XAS/XRD viewers to export similarly

---

## 7. Storage (`storage.py`)

**Decisions:**
- Backend manages storage
- Current: temp parquet files (simple, sufficient for single-user)
- Future: can swap to DuckDB if needed (interface designed to allow this)

### Public API

```python
class DataStore:
    """Manages storage of datasets during a session."""

    def __init__(self, session_id: str | None = None):
        """Create store. Generates unique session_id if not provided."""

    def save(self, dataset: EchemDataset) -> str:
        """Save dataset, return storage key."""

    def load(self, key: str) -> EchemDataset:
        """Load dataset by key."""

    def list_keys(self) -> list[str]:
        """List all stored dataset keys."""

    def delete(self, key: str) -> None:
        """Delete a stored dataset."""

    def cleanup(self) -> None:
        """Clean up all stored data for this session."""
```

### Implementation

- Storage location: `/tmp/echem_session_{session_id}/`
- Each dataset saved as `{key}.parquet` + `{key}.meta.json`
- Metadata JSON contains everything except the DataFrame

---

## 8. Code Generation (`codegen.py`)

**Decisions:**
- Part of echem_core (moved from root)
- Flexible column handling (uses whatever columns are in data)
- Generates standalone Python script

### Public API

```python
def generate_plot_code(
    datasets: list[EchemDataset],
    plot_settings: dict
) -> str:
    """
    Generate standalone Python script to recreate plot.

    Args:
        datasets: Datasets included in plot
        plot_settings: x_col, y_col, colors, line styles, etc.

    Returns:
        Python code as string
    """
```

### Generated Script Features

- Loads parquet/csv files
- Recreates plot with same settings
- Self-contained (no echem_core dependency)
- Can be customized by user

---

## 9. Frontend (`app.py`)

**Decisions:**
- Contains only marimo-specific code
- UI widgets, reactive state, plot rendering
- Calls echem_core functions for all data operations
- Display unit conversion (A → mA) happens here

### What Stays in app.py

- Marimo widgets (file upload, selectors, buttons, sliders)
- Marimo state management (`mo.state()`)
- Plotly figure creation and rendering
- Layout and styling
- Display unit conversion (e.g., show current as mA)

### What Moves to echem_core

| Currently in app.py | Moves to |
|--------------------|----------|
| `process_files_from_dict()` | `parsers/__init__.py` |
| Export logic (lines 1318-1474) | `export.py` |
| Import logic (lines 349-379) | `export.py` |
| `save_df()`, `load_df()` | `storage.py` |
| Code generation call | Uses `codegen.py` |

### Example: Simplified app.py Usage

```python
import marimo as mo
from echem_core import load_file_bytes, export_session_bytes, DataStore
from echem_core.transforms import normalize_by_area

store = DataStore()

@app.cell
def handle_upload(file_upload):
    datasets = []
    for f in file_upload.value:
        dataset = load_file_bytes(f.contents, f.name)
        store.save(dataset)
        datasets.append(dataset)
    return datasets

@app.cell
def handle_export(datasets, selected, plot_figure, plot_settings):
    filtered = [d for d in datasets if d.filename in selected]
    return mo.download(
        data=export_session_bytes(filtered, plot_figure, plot_settings),
        filename="export.zip"
    )
```

### UI State Structure (ui_state.json)

Frontend defines the plot settings structure. Backend treats it as opaque — just serializes/deserializes.

Current marimo frontend uses:

```json
{
  "selected_files": ["sample1_CA.parquet", "sample2_CA.parquet"],
  "plot_settings": {
    "x_column": "time_s",
    "y_column": "current_A",
    "plot_type": "overlay",
    "color_scheme": "Viridis",
    "line_mode": "lines",
    "marker_type": "circle",
    "marker_size": 6,
    "trace_linewidth": 2,
    "axis_linewidth": 4,
    "x_scale": "linear",
    "y_scale": "linear",
    "show_grid": true,
    "show_legend": true,
    "legend_position": "right",
    "plot_height": 500,
    "plot_width": 800,
    "plot_title": "",
    "x_label": "",
    "y_label": ""
  }
}
```

When switching to FastAPI + JS frontend, the new frontend defines its own structure.

---

## 10. Migration Plan

### Phase 1: Create Package Structure

1. Create `echem_core/` directory
2. Create `echem_core/__init__.py`
3. Create `echem_core/types.py` with `EchemDataset` dataclass

### Phase 2: Move Parsers

1. Create `echem_core/parsers/` directory
2. Move `biologic.py` → `echem_core/parsers/biologic.py`
3. Move `gamry.py` → `echem_core/parsers/gamry.py`
4. Create `echem_core/parsers/__init__.py` with `load_file()`, `load_file_bytes()`
5. Add SI unit conversion and column standardization
6. Update parsers to return `EchemDataset`

### Phase 3: Move Analysis

1. Create `echem_core/analysis/` directory
2. Move `technique_analysis.py` → split into `analysis/common.py`, `analysis/eis.py`, `analysis/ca.py`
3. Create `echem_core/analysis/__init__.py`
4. Update column name references to new standard names

### Phase 4: Create New Modules

1. Create `echem_core/storage.py` — extract from app.py
2. Create `echem_core/export.py` — extract from app.py
3. Create `echem_core/transforms.py` — new module
4. Move `codegen.py` → `echem_core/codegen.py`

### Phase 5: Update app.py

1. Update imports to use `echem_core`
2. Replace inline logic with echem_core function calls
3. Remove extracted code
4. Test that app still works

### Phase 6: Update Export Format

1. Implement new export format per Section 6.1
2. Add backward-compatible import (detect old format)
3. Add plot PNG and code generation to export

---

## Dependencies

### echem_core (backend)

```
polars
galvani
kaleido  # optional, for PNG export
```

### Frontend (app.py)

```
marimo
plotly
echem_core  # local package
```

No plotly or marimo in echem_core — keeps backend lightweight.
