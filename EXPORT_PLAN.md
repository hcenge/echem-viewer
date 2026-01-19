# Export Panel & Multi-Plot Architecture Plan

> **Status: ✅ COMPLETE** (except optional drag-to-reorder)

## Overview

Transform the single-plot viewer into a multi-plot session manager where users can:
1. Create and save multiple named plots from a shared file pool
2. Export selected plots with full session re-import capability

---

## Data Model

```typescript
// A saved plot configuration
interface PlotConfig {
  id: string;                      // UUID
  name: string;                    // "EIS Nyquist", "CV Plot 1", etc.
  createdAt: string;               // ISO timestamp
  updatedAt: string;               // ISO timestamp

  // Data selection
  selectedFiles: string[];         // Filenames from shared pool
  selectedCycles: Record<string, number[]>;  // Per-file cycle selection

  // Chart settings (existing ChartSettings type)
  settings: ChartSettings;
}

// Session state (add to existing state)
interface SessionState {
  // Existing
  datasets: Record<string, EchemDataset>;
  file_metadata: Record<string, dict>;

  // New
  plots: PlotConfig[];
  activePlotId: string | null;     // Currently editing plot
  hasUnsavedChanges: boolean;      // Track dirty state
}
```

---

## UI Components

### 1. PlotsList (New Component)

**Location:** Right side panel, opposite data sidebar

```
┌─────────────────┐
│ Saved Plots     │
│ ───────────────│
│ [+ Save Plot]   │  ← Saves current view as new plot
│                 │
│ ● EIS Nyquist   │  ← Active (highlighted)
│   ├ Edit        │
│   ├ Duplicate   │
│   └ Delete      │
│                 │
│ ○ CV Cycles     │  ← Click to switch (with unsaved warning)
│ ○ CA Charge     │
└─────────────────┘
```

**Features:**
- "Save Plot" button at top (prominent)
- Auto-names as "Plot 1", "Plot 2" or "EIS Plot 1" based on technique
- Inline rename (click name to edit)
- Right-click or hover menu: Edit, Duplicate, Delete
- Active plot highlighted
- Drag to reorder (optional, nice-to-have)

### 2. Save Plot Button

**Location:** Top of Sidebar (above Axes section)

**Behavior:**
- If no active plot: Creates new plot, stays on it for editing
- If active plot exists: Updates the existing plot
- Button text: "Save Plot" (new) or "Update Plot" (existing)

### 3. ExportPanel (New Component)

**Location:** Bottom of page or collapsible drawer

```
┌─────────────────────────────────────────────────────────────┐
│ Export Session                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Select Plots:                    Data Format:               │
│ ☑ EIS Nyquist                   ○ Parquet (recommended)    │
│ ☑ CV Cycles                     ○ CSV (Excel compatible)   │
│ ☐ CA Charge                                                 │
│ [Select All] [Select None]      Code Style:                 │
│                                  ○ Plotly (interactive)     │
│                                  ○ Matplotlib (publication) │
│                                                             │
│                        [Export Selected Plots]              │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Checkbox list of saved plots
- Select All / Select None buttons
- Radio buttons for data format (Parquet/CSV)
- Radio buttons for code style (Plotly/Matplotlib)
- Export button downloads zip

---

## Export Zip Structure

```
echem_export/
├── metadata.json          # CENTRAL FILE REGISTRY - all files & their metadata
├── plots/
│   ├── plots.json         # All plot configurations
│   ├── eis_nyquist.py     # One code file per selected plot
│   ├── cv_cycles.py
│   └── ...
├── data/
│   ├── file1.parquet      # Only files used by selected plots
│   ├── file2.parquet
│   └── ...
└── file_table.csv         # Custom columns as spreadsheet (for Excel users)
```

### metadata.json (Central File Registry)

This is the **single source of truth** for all file information. Plots reference files by filename from this registry.

```json
{
  "schema_version": "2.0.0",
  "format": "echem-viewer-export",
  "exported_at": "2024-01-15T10:30:00Z",
  "files": [
    {
      "filename": "file1.mpr",
      "data_path": "data/file1.parquet",
      "technique": "PEIS",
      "timestamp": "2024-01-10T14:30:00Z",
      "source_format": "biologic",
      "columns": ["time_s", "potential_V", "current_A", "z_real_Ohm", "z_imag_Ohm"],
      "cycles": [1, 2, 3],
      "label": "Sample A - 25C",
      "custom": {
        "resistance": "5.2",
        "temperature": "25",
        "notes": "good data"
      }
    },
    {
      "filename": "file2.mpr",
      "data_path": "data/file2.parquet",
      "technique": "PEIS",
      "timestamp": "2024-01-10T15:00:00Z",
      "source_format": "biologic",
      "columns": ["time_s", "potential_V", "current_A", "z_real_Ohm", "z_imag_Ohm"],
      "cycles": [1, 2, 3],
      "label": "Sample A - 50C",
      "custom": {
        "resistance": "4.8",
        "temperature": "50",
        "notes": ""
      }
    }
  ]
}
```

### plots/plots.json (Plot Configurations)

Plots reference files by `filename` which maps to entries in metadata.json.

```json
{
  "plots": [
    {
      "id": "abc123",
      "name": "EIS Nyquist",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:25:00Z",
      "selected_files": ["file1.mpr", "file2.mpr"],
      "selected_cycles": {},
      "settings": {
        "xCol": "z_real_Ohm",
        "yCol": "z_imag_Ohm",
        "plotType": "overlay",
        "colorScheme": "Viridis",
        "lineMode": "lines",
        "showLegend": true,
        "legendSource": "label"
      }
    },
    {
      "id": "def456",
      "name": "CV Cycles",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "selected_files": ["cv_file.mpr"],
      "selected_cycles": {"cv_file.mpr": [1, 3, 5]},
      "settings": {
        "xCol": "potential_V",
        "yCol": "current_A",
        "plotType": "overlay"
      }
    }
  ]
}
```

---

## Unsaved Changes Handling

**Track changes by comparing:**
- Current selectedFiles vs activePlot.selectedFiles
- Current selectedCycles vs activePlot.selectedCycles
- Current chartSettings vs activePlot.settings

**When switching plots with unsaved changes:**
```
┌─────────────────────────────────────┐
│ Unsaved Changes                     │
│                                     │
│ You have unsaved changes to        │
│ "EIS Nyquist". What would you      │
│ like to do?                         │
│                                     │
│ [Save Changes] [Discard] [Cancel]  │
└─────────────────────────────────────┘
```

---

## Implementation Order

### Phase A: Plot Management (Frontend State) ✅ COMPLETE
1. ✅ Add PlotConfig type and plots state to App.tsx
2. ✅ Create PlotsList component with save/rename/delete
3. ✅ Add "Save Plot" button to PlotsList
4. ✅ Implement unsaved changes detection and warning dialog
5. ✅ Wire up plot switching (load settings when clicking plot)

### Phase B: Export Panel ✅ COMPLETE
6. ✅ Create ExportPanel component with plot selection
7. ✅ Update useApi to pass selected plots to export
8. ✅ Update backend /export to accept plot configs
9. ✅ Update export.py to generate per-plot code files
10. ✅ Update session_import to restore plots

### Phase C: Polish ⚠️ PARTIAL
11. ✅ Add duplicate plot functionality
12. ❌ Add drag-to-reorder (optional, skipped)
13. ❓ Test full round-trip: create plots → export → re-import (needs testing)

---

## Backend Changes

### New/Updated Endpoints

**POST /export** (update)
```python
class ExportRequest(BaseModel):
    plots: list[PlotConfig]        # Full plot configs to export
    format: str = "parquet"        # "parquet" or "csv"
    code_style: str = "plotly"     # "plotly" or "matplotlib"
```

**Response:** Zip file with structure above

### session_export() updates
- Accept plots list instead of single plot_settings
- Generate one code file per plot in plots/ folder
- Include ui_state.json with full plot configs
- Only include data files used by selected plots

### session_import() updates
- Read ui_state.json and restore plots list
- Return plots along with datasets

---

## Migration Notes

- Existing exports (without plots) should still import
- Single-plot exports become a session with one plot
- Backend should handle both old and new export formats