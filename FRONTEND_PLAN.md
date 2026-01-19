# React + FastAPI Frontend Implementation Plan

> **Status:** Phases 1-4, 6 complete. **Phase 5 (Analysis Tools) not started.** Phase 7 partial.

## Overview

Replace the marimo frontend (app.py) with a React + FastAPI application while keeping `echem_core` as a standalone library.

**Stack:**
- Backend: FastAPI
- Frontend: React + TypeScript
- UI: Material UI (MUI)
- Charts: react-plotly.js
- Tables: MUI DataGrid
- State: React useState/useContext (single-user app)

**Architecture:** Hybrid state model
- Server: Stores parsed DataFrames, runs analysis functions
- Client: Holds UI state, receives display-ready data for charts

---

## Project Structure

```
echem-viewer/
├── echem_core/           # Standalone library (exists)
│   ├── __init__.py
│   ├── types.py
│   ├── parsers/
│   ├── analysis/
│   ├── export.py
│   ├── codegen.py
│   └── transforms.py
├── backend/              # FastAPI app
│   ├── main.py           # API routes
│   ├── state.py          # In-memory session state
│   └── requirements.txt
└── frontend/             # React app
    ├── src/
    │   ├── components/
    │   ├── hooks/
    │   ├── types/
    │   └── App.tsx
    ├── package.json
    └── vite.config.ts
```

---

## Section 1: Backend API (FastAPI)

### State Management

Reference: app.py lines 87-106 (`get_state`/`set_state` pattern)

```python
# backend/state.py
# Single-user in-memory state (like current app.py)

from echem_core import EchemDataset

class SessionState:
    datasets: dict[str, EchemDataset] = {}
    file_metadata: dict[str, dict] = {}  # User-editable metadata
```

### API Endpoints

| Endpoint | Method | Purpose | Reference |
|----------|--------|---------|-----------|
| `/upload` | POST | Upload .mpr/.dta/.zip files | app.py:152-208 |
| `/files` | GET | List loaded files with metadata | app.py:589-610 |
| `/files/{filename}` | DELETE | Remove file from session | app.py:638-648 |
| `/files/{filename}/metadata` | PATCH | Update label, custom columns | app.py:627-636 |
| `/data/{filename}` | GET | Get display-ready x/y arrays | app.py:849-867 |
| `/analysis/{technique}` | POST | Run analysis on selected files | app.py:750-815 |
| `/export` | POST | Generate export zip | app.py:1096-1150 |
| `/export/code` | POST | Generate plot code | app.py:1118-1135 |

### Key Backend Functions

**File Upload Processing:**
```python
# Reference: app.py:152-208
@app.post("/upload")
async def upload_files(files: list[UploadFile]):
    for file in files:
        content = await file.read()
        if file.filename.endswith('.zip'):
            # Session import: echem_core.session_import()
            datasets, ui_state = session_import(content)
        else:
            # Parse raw file: echem_core.load_file_bytes()
            dataset = load_file_bytes(content, file.filename)
        # Store in state
```

**Data Retrieval (display-ready):**
```python
# Reference: app.py:849-867
@app.get("/data/{filename}")
def get_data(filename: str, x_col: str, y_col: str, cycles: list[int] = None):
    ds = state.datasets[filename]
    df = ds.df
    if cycles:
        df = df.filter(pl.col('cycle').is_in(cycles))
    return {
        "x": df[x_col].to_list(),
        "y": df[y_col].to_list(),
    }
```

---

## Section 2: Upload Component

Reference: app.py lines 137-150 (UI), 152-208 (processing)

### Requirements
- Single dropzone accepting `.mpr`, `.dta`, `.zip`
- Error handling for invalid file types
- Progress bar during upload
- Incremental add (files accumulate)
- Delete handled via table component

### Implementation

**Frontend Component:** `src/components/FileUpload.tsx`

```typescript
// MUI + react-dropzone
import { useDropzone } from 'react-dropzone';
import { LinearProgress, Alert } from '@mui/material';

interface FileUploadProps {
  onUploadComplete: () => void;
}

// Accept: .mpr, .dta, .zip
// POST to /upload with multipart/form-data
// Show progress bar during upload
// Show error alert for invalid files
```

**API Endpoint:** `POST /upload`
- Accepts multipart/form-data
- Validates file extensions
- Returns list of added files or error

---

## Section 3: File Metadata Table

Reference: app.py lines 589-660

### Requirements
- Default columns: filename, label, technique
- Expandable columns: timestamp, source, cycles
- Editable: label only
- Read-only: filename, technique, timestamp, source
- Add custom columns (for resistance, iR drop, etc.)
- Row delete action
- Row selection for export

### Implementation

**Frontend Component:** `src/components/FileTable.tsx`

```typescript
// MUI DataGrid
import { DataGrid, GridColDef } from '@mui/x-data-grid';

// Column definitions:
// - filename (read-only)
// - label (editable)
// - technique (read-only)
// - [expandable: timestamp, source, cycles]
// - [custom columns: user-added]
// - actions (delete button)

// Features:
// - Row selection (checkbox) for export
// - "Add Column" button for custom metadata
// - processRowUpdate -> PATCH /files/{filename}/metadata
// - Delete button -> DELETE /files/{filename}
```

**API Endpoints:**
- `GET /files` - List all files with metadata
- `PATCH /files/{filename}/metadata` - Update editable fields
- `DELETE /files/{filename}` - Remove file

---

## Section 4: Chart Component

Reference: app.py lines 665-943

### Requirements
- Plotly with all interactive defaults (pan, zoom, hover, box select)
- Live updates on settings change
- Screenshot export via Plotly toolbar
- Plot types: overlay, y_stacked, x_stacked, grid

### Implementation

**Frontend Component:** `src/components/Chart.tsx`

```typescript
import Plot from 'react-plotly.js';

interface ChartProps {
  files: string[];
  xCol: string;
  yCol: string;
  plotType: 'overlay' | 'y_stacked' | 'x_stacked' | 'grid';
  settings: ChartSettings;
}

// Fetch data from /data/{filename} for each selected file
// Build Plotly traces with color cycling
// Handle plot type layouts (subplots for stacked/grid)
// Reference: app.py:870-935 for layout logic
```

**Data Fetching:**
```typescript
// For each selected file, fetch display data:
// GET /data/{filename}?x_col=...&y_col=...&cycles=...
// Returns { x: number[], y: number[] }
```

**Plot Type Logic (from app.py:895-935):**
- `overlay`: All traces on same axes
- `y_stacked`: Shared x-axis, separate y-axes (make_subplots rows)
- `x_stacked`: Shared y-axis, separate x-axes (make_subplots cols)
- `grid`: Separate subplot per file

---

## Section 5: Technique Tabs

Reference: app.py lines 253-287

### Requirements
- Show only techniques present in loaded data
- Add "All" tab to show all files
- Position: centered above chart
- Selecting tab filters file selector

### Implementation

**Frontend Component:** `src/components/TechniqueTabs.tsx`

```typescript
import { Tabs, Tab } from '@mui/material';

interface TechniqueTabsProps {
  techniques: string[];  // From loaded files
  activeTab: string | 'all';
  onTabChange: (technique: string | 'all') => void;
}

// Tabs: ['All', ...techniques present in data]
// Centered with MUI sx={{ justifyContent: 'center' }}
```

**State Flow:**
1. `GET /files` returns files with techniques
2. Extract unique techniques
3. Tab change updates filter for file selector

---

## Section 6: Sidebar / Chart Controls

Reference: app.py lines 216-469

### Requirements
- Collapsible sections (can consolidate)
- Auto-select x/y from TECHNIQUE_DEFAULTS
- Technique-specific controls separate from general
- File selector (multi-select, filtered by technique)
- Cycle selector for CV/LSV

### Sections

**6a. Data Selection**
```typescript
// - File multi-select (filtered by active technique)
// - Cycle selector (for CV/LSV only)
// Reference: app.py:216-250, 324-332
```

**6b. Axes**
```typescript
// - X column dropdown
// - Y column dropdown
// - X/Y axis labels (text input)
// - Log scale toggles
// - Invert axis toggles
// Reference: app.py:373-393
```

**6c. Layout**
```typescript
// - Plot type (overlay/stacked/grid)
// - Stacking options (gap, normalize)
// - Width/height inputs
// Reference: app.py:362-369, 395-420
```

**6d. Legend**
```typescript
// - Show legend toggle
// - Legend source (label/filename/technique)
// - Position dropdown
// - Font size slider
// Reference: app.py:463-468
```

### Implementation

**Frontend Component:** `src/components/Sidebar.tsx`

```typescript
import { Accordion, AccordionSummary, AccordionDetails } from '@mui/material';

// Collapsible sections using MUI Accordion
// Each section manages its own state
// Changes trigger live chart update
```

---

## Section 7: Technique-Specific Tools

Reference: app.py lines 334-356, 750-815

### Requirements
- Separate panel from general controls
- Dedicated results display panel
- Run analysis on all selected files
- "Copy to table" adds result as custom column

### Tools by Technique

| Technique | Controls | Analysis Functions |
|-----------|----------|-------------------|
| PEIS/GEIS/EIS | Nyquist/Bode toggle | `find_hf_intercept`, `find_lf_intercept` |
| CA | Time range (start/end) | `calculate_time_average`, `calculate_charge` |
| CP | Time range | `overpotential_at_current` |
| CV | (cycle selector in sidebar) | - |
| LSV | - | `onset_potential`, `limiting_current`, `current_at_potential` |
| OCV | - | `steady_state_potential` |

### Implementation

**Frontend Component:** `src/components/TechniqueTools.tsx`

```typescript
// Renders different controls based on active technique
// Reference: app.py:334-356

interface TechniqueToolsProps {
  technique: string;
  selectedFiles: string[];
  onCopyToTable: (column: string, values: Record<string, any>) => void;
}
```

**Frontend Component:** `src/components/AnalysisResults.tsx`

```typescript
// Displays analysis results in a panel
// Reference: app.py:750-815

// Table format:
// | Filename | HF Intercept | LF Intercept | ... |
// "Copy to Table" button for each column
```

**API Endpoint:** `POST /analysis/{technique}`

```python
@app.post("/analysis/{technique}")
def run_analysis(
    technique: str,
    files: list[str],
    params: dict  # e.g., time_start, time_end for CA
):
    results = {}
    for fname in files:
        ds = state.datasets[fname]
        if technique == 'PEIS':
            results[fname] = {
                'hf_intercept': find_hf_intercept(ds.df),
                'lf_intercept': find_lf_intercept(ds.df),
            }
        # ... etc
    return results
```

---

## Section 8: Export

Reference: app.py lines 1090-1150

### Requirements
- Formats: Parquet (default), CSV
- Selection via table checkboxes
- Plot code: radio buttons for Plotly vs Matplotlib

### Implementation

**Frontend Component:** `src/components/ExportPanel.tsx`

```typescript
import { RadioGroup, Radio, Button } from '@mui/material';

// - Format selector: Parquet / CSV
// - Code style selector: Plotly / Matplotlib
// - Export button (downloads zip)
// - Uses selected rows from FileTable
```

**API Endpoint:** `POST /export`

```python
@app.post("/export")
def export_session(
    files: list[str],
    format: Literal['parquet', 'csv'],
    code_style: Literal['plotly', 'matplotlib'],
    plot_settings: dict,
):
    datasets = [state.datasets[f] for f in files]

    # Generate plot code
    if code_style == 'plotly':
        code = generate_plot_code(plot_settings, files)
    else:
        code = generate_matplotlib_code(plot_settings, files)

    # Create export
    if format == 'parquet':
        return session_export(datasets, plot_settings, plot_code=code)
    else:
        return csv_export(datasets, plot_settings, plot_code=code)
```

**New function needed:** `generate_matplotlib_code()` in echem_core/codegen.py

---

## Implementation Order

### Phase 1: Foundation ✅ COMPLETE
1. ✅ Set up backend project structure
2. ✅ Create FastAPI app with state management
3. ✅ Set up frontend with Vite + React + TypeScript
4. ✅ Install MUI (including @mui/x-data-grid), react-plotly.js

### Phase 2: Core Data Flow ✅ COMPLETE
5. ✅ Implement `/upload` endpoint
6. ✅ Implement `/files` endpoint
7. ✅ Build FileUpload component
8. ✅ Build FileTable component (basic version)

### Phase 3: Visualization ✅ COMPLETE
9. ✅ Implement `/data/{filename}` endpoint
10. ✅ Build Chart component (overlay mode first)
11. ✅ Build TechniqueTabs component
12. ✅ Build Sidebar with basic controls

### Phase 4: Full Controls ✅ COMPLETE
13. ✅ Complete Sidebar sections (axes, layout, legend)
14. ✅ Add plot type support (stacked, grid)
15. ✅ Add cycle selector for CV/LSV
16. ✅ Complete FileTable (custom columns, delete)

### Phase 5: Analysis ❌ NOT STARTED
17. ❌ Implement `/analysis/{technique}` endpoint
18. ❌ Build TechniqueTools component
19. ❌ Build AnalysisResults component
20. ❌ Implement "Copy to Table" functionality

### Phase 6: Export ✅ COMPLETE
21. ✅ Implement `/export` endpoint
22. ✅ Add `generate_matplotlib_code()` to echem_core
23. ✅ Build ExportPanel component
24. ✅ Add table row selection for export

### Phase 7: Polish ⚠️ PARTIAL
25. ⚠️ Error handling throughout (basic error snackbar implemented)
26. ⚠️ Loading states (basic loading states implemented)
27. ❌ Responsive layout
28. ❌ Testing

---

## File Reference Map

| New Component | app.py Reference |
|---------------|------------------|
| FileUpload | 137-150, 152-208 |
| FileTable | 589-660 |
| Chart | 665-943 |
| TechniqueTabs | 253-287 |
| Sidebar | 216-469, 473-585 |
| TechniqueTools | 334-356 |
| AnalysisResults | 750-815 |
| ExportPanel | 1090-1150 |
