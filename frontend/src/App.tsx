import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  CssBaseline,
  ThemeProvider,
  createTheme,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Chip,
  Tooltip,
} from '@mui/material';
import { useApi } from './hooks/useApi';
import { FileTable } from './components/FileTable/index';
import { Chart } from './components/Chart';
import { TechniqueTabs } from './components/TechniqueTabs';
import { Sidebar } from './components/Sidebar/index';
import { PlotsList } from './components/PlotsList';
import { ExportPanel } from './components/ExportPanel';
import type { ChartSettings } from './components/Chart';
import { CHART_DEFAULTS } from './constants/chart';
import type { FileInfo, DataResponse, PlotConfig, SessionStats, PlotConfigExport } from './types/api';

// Generate unique ID for plots
function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
  },
});

function App() {
  const {
    error,
    clearError,
    listFiles,
    uploadFiles,
    deleteFile,
    updateMetadata,
    getData,
    getTechniques,
    getStats,
    exportSession,
  } = useApi();

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [customColumns, setCustomColumns] = useState<Record<string, Record<string, unknown>>>({});
  const [techniqueDefaults, setTechniqueDefaults] = useState<Record<string, { x: string; y: string }>>({});
  const [activeTechnique, setActiveTechnique] = useState<string | 'all'>('all');
  const [chartSettings, setChartSettings] = useState<ChartSettings>({ ...CHART_DEFAULTS });
  // Per-file cycle selection (filename -> selected cycles)
  const [selectedCycles, setSelectedCycles] = useState<Record<string, number[]>>({});

  // Multi-plot state
  const [plots, setPlots] = useState<PlotConfig[]>([]);
  const [activePlotId, setActivePlotId] = useState<string | null>(null);
  const [unsavedChangesDialog, setUnsavedChangesDialog] = useState<{
    open: boolean;
    targetPlotId: string | null;
    action: 'switch' | 'new' | null;
  }>({ open: false, targetPlotId: null, action: null });

  // Track the last saved state to detect changes
  const lastSavedState = useRef<{
    selectedFiles: string[];
    selectedCycles: Record<string, number[]>;
    settings: ChartSettings;
  } | null>(null);

  // Load files on mount
  const refreshFiles = useCallback(async () => {
    try {
      const updatedFiles = await listFiles();
      setFiles(updatedFiles);
      // Load custom columns from API response
      const loadedCustomColumns: Record<string, Record<string, unknown>> = {};
      for (const file of updatedFiles) {
        if (file.custom && Object.keys(file.custom).length > 0) {
          loadedCustomColumns[file.filename] = file.custom;
        }
      }
      setCustomColumns((prev) => {
        // Merge: API data takes precedence, but keep local columns that aren't on server yet
        const merged: Record<string, Record<string, unknown>> = {};
        const allFilenames = new Set([...Object.keys(prev), ...Object.keys(loadedCustomColumns)]);
        for (const filename of allFilenames) {
          merged[filename] = { ...prev[filename], ...loadedCustomColumns[filename] };
        }
        return merged;
      });
      // Fetch stats
      const sessionStats = await getStats();
      setStats(sessionStats);
    } catch {
      // Error handled by useApi
    }
  }, [listFiles, getStats]);

  useEffect(() => {
    refreshFiles();
    // Fetch technique defaults
    getTechniques()
      .then((data) => setTechniqueDefaults(data.defaults))
      .catch(() => {/* ignore */});
  }, [refreshFiles, getTechniques]);

  // Handle file upload
  const handleUpload = async (filesToUpload: File[]) => {
    const response = await uploadFiles(filesToUpload);
    await refreshFiles();

    // Restore plots if importing a session
    if (response.plots && response.plots.length > 0) {
      const restoredPlots: PlotConfig[] = response.plots.map((p: PlotConfigExport) => ({
        id: p.id || generateId(),
        name: p.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        selectedFiles: p.selected_files,
        selectedCycles: p.selected_cycles || {},
        settings: p.settings as unknown as ChartSettings,
      }));
      setPlots((prev) => [...prev, ...restoredPlots]);
    }
  };

  // Handle deleting selected files
  const handleDeleteSelected = async (filenames: string[]) => {
    for (const filename of filenames) {
      await deleteFile(filename);
    }
    setSelectedFiles([]);
    await refreshFiles();
  };

  // Handle label change
  const handleLabelChange = async (filename: string, newLabel: string) => {
    await updateMetadata(filename, { label: newLabel });
    await refreshFiles();
  };

  // Fallback standard column names if no technique defaults
  const STANDARD_X_COLS = ['time_s', 'potential_V', 'z_real_Ohm', 'frequency_Hz'];
  const STANDARD_Y_COLS = ['current_A', 'potential_V', 'z_imag_Ohm', 'z_mag_Ohm'];

  // Filter files by active technique
  const filteredFiles = useMemo(() => {
    if (activeTechnique === 'all') return files;
    return files.filter((f) => f.technique === activeTechnique);
  }, [files, activeTechnique]);

  // Get available columns that exist in ALL selected files
  const availableColumns = useMemo(() => {
    const selectedFileInfos = filteredFiles.filter((f) => selectedFiles.includes(f.filename));
    if (selectedFileInfos.length === 0) {
      // If no files selected, show columns from all filtered files
      const columnSet = new Set<string>();
      filteredFiles.forEach((f) => f.columns.forEach((col) => columnSet.add(col)));
      return Array.from(columnSet).sort();
    }
    // Find intersection of columns across all selected files
    const columnSets = selectedFileInfos.map((f) => new Set(f.columns));
    const intersection = columnSets.reduce((acc, set) => {
      return new Set([...acc].filter((col) => set.has(col)));
    });
    return Array.from(intersection).sort();
  }, [filteredFiles, selectedFiles]);

  // Handle per-file cycle change
  const handleFileCyclesChange = (filename: string, cycles: number[]) => {
    setSelectedCycles((prev) => ({
      ...prev,
      [filename]: cycles,
    }));
  };

  // Initialize cycles for files when they're loaded (default to all cycles)
  useEffect(() => {
    const newCycles: Record<string, number[]> = {};
    let hasChanges = false;
    for (const file of files) {
      if (file.cycles && file.cycles.length > 0 && !selectedCycles[file.filename]) {
        newCycles[file.filename] = file.cycles;
        hasChanges = true;
      }
    }
    if (hasChanges) {
      setSelectedCycles((prev) => ({ ...prev, ...newCycles }));
    }
  }, [files, selectedCycles]);

  // Handle chart settings change
  const handleSettingsChange = (newSettings: ChartSettings) => {
    setChartSettings(newSettings);
  };

  // Handle technique tab change
  const handleTechniqueChange = (technique: string | 'all') => {
    setActiveTechnique(technique);
    // Select all files in the new filtered view by default
    const newFilteredFiles = technique === 'all'
      ? files
      : files.filter((f) => f.technique === technique);
    setSelectedFiles(newFilteredFiles.map((f) => f.filename));
    // Update chart settings with new technique defaults and reset ranges
    if (technique !== 'all' && techniqueDefaults[technique]) {
      const defaults = techniqueDefaults[technique];
      setChartSettings((prev) => ({
        ...prev,
        xCol: defaults.x,
        yCol: defaults.y,
        // Reset axis ranges for new technique
        xMin: undefined,
        xMax: undefined,
        yMin: undefined,
        yMax: undefined,
        // Reset units for new technique
        xUnit: undefined,
        yUnit: undefined,
      }));
    } else {
      // Reset axis ranges even for 'all' tab
      setChartSettings((prev) => ({
        ...prev,
        xMin: undefined,
        xMax: undefined,
        yMin: undefined,
        yMax: undefined,
        xUnit: undefined,
        yUnit: undefined,
      }));
    }
  };

  // Handle selection change
  const handleSelectionChange = (filenames: string[]) => {
    setSelectedFiles(filenames);
    // Auto-select columns if not set and files have columns
    if (filenames.length > 0 && !chartSettings.xCol && !chartSettings.yCol) {
      const firstFile = files.find((f) => f.filename === filenames[0]);
      if (firstFile && firstFile.columns.length >= 2) {
        let xCol: string;
        let yCol: string;

        // Use technique defaults if available
        const technique = firstFile.technique;
        if (technique && techniqueDefaults[technique]) {
          const defaults = techniqueDefaults[technique];
          xCol = firstFile.columns.includes(defaults.x) ? defaults.x : firstFile.columns[0];
          yCol = firstFile.columns.includes(defaults.y) ? defaults.y : firstFile.columns[1];
        } else {
          // Fallback to standard columns
          xCol = STANDARD_X_COLS.find((c) => firstFile.columns.includes(c)) || firstFile.columns[0];
          yCol = STANDARD_Y_COLS.find((c) => firstFile.columns.includes(c) && c !== xCol) || firstFile.columns[1];
        }

        setChartSettings((prev) => ({
          ...prev,
          xCol,
          yCol,
        }));
      }
    }
  };

  // Wrapper for getData that matches Chart component signature
  const handleGetData = useCallback(
    async (filename: string, xCol: string, yCol: string, cycles?: number[]): Promise<DataResponse> => {
      return getData(filename, { x_col: xCol, y_col: yCol, cycles });
    },
    [getData]
  );

  // Handle adding custom column
  const handleAddCustomColumn = (columnName: string) => {
    // Initialize the column for all files with empty values
    setCustomColumns((prev) => {
      const updated = { ...prev };
      files.forEach((file) => {
        if (!updated[file.filename]) {
          updated[file.filename] = {};
        }
        updated[file.filename][columnName] = '';
      });
      return updated;
    });
  };

  // Handle renaming custom column
  const handleRenameCustomColumn = async (oldName: string, newName: string) => {
    // Update local state
    setCustomColumns((prev) => {
      const updated: Record<string, Record<string, unknown>> = {};
      for (const [filename, cols] of Object.entries(prev)) {
        updated[filename] = {};
        for (const [colName, value] of Object.entries(cols)) {
          if (colName === oldName) {
            updated[filename][newName] = value;
          } else {
            updated[filename][colName] = value;
          }
        }
      }
      return updated;
    });
    // Persist to backend: set new key with value, delete old key
    try {
      for (const file of files) {
        const oldValue = customColumns[file.filename]?.[oldName];
        if (oldValue !== undefined) {
          await updateMetadata(file.filename, {
            custom: { [newName]: oldValue, [oldName]: null },
          });
        }
      }
    } catch {
      // Error handled by useApi
    }
  };

  // Handle deleting custom column
  const handleDeleteCustomColumn = async (columnName: string) => {
    // Update local state
    setCustomColumns((prev) => {
      const updated: Record<string, Record<string, unknown>> = {};
      for (const [filename, cols] of Object.entries(prev)) {
        updated[filename] = {};
        for (const [colName, value] of Object.entries(cols)) {
          if (colName !== columnName) {
            updated[filename][colName] = value;
          }
        }
      }
      return updated;
    });
    // Persist to backend: delete the key from all files
    try {
      for (const file of files) {
        if (customColumns[file.filename]?.[columnName] !== undefined) {
          await updateMetadata(file.filename, {
            custom: { [columnName]: null },
          });
        }
      }
    } catch {
      // Error handled by useApi
    }
  };

  // Handle custom cell value change
  const handleCustomCellChange = async (filename: string, columnName: string, value: string) => {
    // Update local state immediately for responsiveness
    setCustomColumns((prev) => ({
      ...prev,
      [filename]: {
        ...prev[filename],
        [columnName]: value,
      },
    }));
    // Persist to backend
    try {
      await updateMetadata(filename, { custom: { [columnName]: value } });
    } catch {
      // Error handled by useApi, but we keep local state
    }
  };

  // ============== Plot Management ==============

  // Check if current state has unsaved changes
  const hasUnsavedChanges = useCallback((): boolean => {
    if (!activePlotId || !lastSavedState.current) return false;

    const saved = lastSavedState.current;

    // Compare selected files
    if (JSON.stringify(selectedFiles.sort()) !== JSON.stringify(saved.selectedFiles.sort())) {
      return true;
    }

    // Compare selected cycles
    if (JSON.stringify(selectedCycles) !== JSON.stringify(saved.selectedCycles)) {
      return true;
    }

    // Compare settings
    if (JSON.stringify(chartSettings) !== JSON.stringify(saved.settings)) {
      return true;
    }

    return false;
  }, [activePlotId, selectedFiles, selectedCycles, chartSettings]);

  // Get active plot
  const activePlot = useMemo(() => {
    return plots.find((p) => p.id === activePlotId) || null;
  }, [plots, activePlotId]);

  // Generate auto-name for new plot
  const generatePlotName = useCallback((): string => {
    const technique = activeTechnique !== 'all' ? activeTechnique : 'Plot';
    const existingNames = plots.map((p) => p.name);
    let counter = 1;
    let name = `${technique} ${counter}`;
    while (existingNames.includes(name)) {
      counter++;
      name = `${technique} ${counter}`;
    }
    return name;
  }, [activeTechnique, plots]);

  // Save current view as a new plot or update existing
  const handleSavePlot = useCallback(() => {
    const now = new Date().toISOString();

    if (activePlotId) {
      // Update existing plot
      setPlots((prev) =>
        prev.map((p) =>
          p.id === activePlotId
            ? {
                ...p,
                updatedAt: now,
                selectedFiles: [...selectedFiles],
                selectedCycles: { ...selectedCycles },
                settings: { ...chartSettings },
              }
            : p
        )
      );
    } else {
      // Create new plot
      const newPlot: PlotConfig = {
        id: generateId(),
        name: generatePlotName(),
        createdAt: now,
        updatedAt: now,
        selectedFiles: [...selectedFiles],
        selectedCycles: { ...selectedCycles },
        settings: { ...chartSettings },
      };
      setPlots((prev) => [...prev, newPlot]);
      setActivePlotId(newPlot.id);
    }

    // Update last saved state
    lastSavedState.current = {
      selectedFiles: [...selectedFiles],
      selectedCycles: { ...selectedCycles },
      settings: { ...chartSettings },
    };
  }, [activePlotId, selectedFiles, selectedCycles, chartSettings, generatePlotName]);

  // Load a plot's state into the editor
  const loadPlot = useCallback((plot: PlotConfig) => {
    setSelectedFiles(plot.selectedFiles);
    setSelectedCycles(plot.selectedCycles);
    setChartSettings(plot.settings);
    setActivePlotId(plot.id);

    // Update last saved state
    lastSavedState.current = {
      selectedFiles: [...plot.selectedFiles],
      selectedCycles: { ...plot.selectedCycles },
      settings: { ...plot.settings },
    };
  }, []);

  // Handle switching to a different plot (with unsaved changes check)
  const handleSwitchPlot = useCallback((plotId: string) => {
    if (plotId === activePlotId) return;

    if (hasUnsavedChanges()) {
      setUnsavedChangesDialog({ open: true, targetPlotId: plotId, action: 'switch' });
    } else {
      const plot = plots.find((p) => p.id === plotId);
      if (plot) loadPlot(plot);
    }
  }, [activePlotId, hasUnsavedChanges, plots, loadPlot]);

  // Handle starting a new plot (with unsaved changes check)
  const handleNewPlot = useCallback(() => {
    if (hasUnsavedChanges()) {
      setUnsavedChangesDialog({ open: true, targetPlotId: null, action: 'new' });
    } else {
      // Clear to defaults
      setSelectedFiles([]);
      setSelectedCycles({});
      setChartSettings({ ...CHART_DEFAULTS });
      setActivePlotId(null);
      lastSavedState.current = null;
    }
  }, [hasUnsavedChanges]);

  // Handle unsaved changes dialog actions
  const handleUnsavedDialogSave = useCallback(() => {
    handleSavePlot();
    const { targetPlotId, action } = unsavedChangesDialog;
    setUnsavedChangesDialog({ open: false, targetPlotId: null, action: null });

    if (action === 'switch' && targetPlotId) {
      const plot = plots.find((p) => p.id === targetPlotId);
      if (plot) loadPlot(plot);
    } else if (action === 'new') {
      setSelectedFiles([]);
      setSelectedCycles({});
      setChartSettings({ ...CHART_DEFAULTS });
      setActivePlotId(null);
      lastSavedState.current = null;
    }
  }, [handleSavePlot, unsavedChangesDialog, plots, loadPlot]);

  const handleUnsavedDialogDiscard = useCallback(() => {
    const { targetPlotId, action } = unsavedChangesDialog;
    setUnsavedChangesDialog({ open: false, targetPlotId: null, action: null });

    if (action === 'switch' && targetPlotId) {
      const plot = plots.find((p) => p.id === targetPlotId);
      if (plot) loadPlot(plot);
    } else if (action === 'new') {
      setSelectedFiles([]);
      setSelectedCycles({});
      setChartSettings({ ...CHART_DEFAULTS });
      setActivePlotId(null);
      lastSavedState.current = null;
    }
  }, [unsavedChangesDialog, plots, loadPlot]);

  const handleUnsavedDialogCancel = useCallback(() => {
    setUnsavedChangesDialog({ open: false, targetPlotId: null, action: null });
  }, []);

  // Rename a plot
  const handleRenamePlot = useCallback((plotId: string, newName: string) => {
    setPlots((prev) =>
      prev.map((p) =>
        p.id === plotId ? { ...p, name: newName, updatedAt: new Date().toISOString() } : p
      )
    );
  }, []);

  // Delete a plot
  const handleDeletePlot = useCallback((plotId: string) => {
    setPlots((prev) => prev.filter((p) => p.id !== plotId));
    if (activePlotId === plotId) {
      setActivePlotId(null);
      lastSavedState.current = null;
    }
  }, [activePlotId]);

  // Duplicate a plot
  const handleDuplicatePlot = useCallback((plotId: string) => {
    const plot = plots.find((p) => p.id === plotId);
    if (!plot) return;

    const now = new Date().toISOString();
    const newPlot: PlotConfig = {
      ...plot,
      id: generateId(),
      name: `${plot.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    setPlots((prev) => [...prev, newPlot]);
  }, [plots]);

  // Export selected plots
  const handleExport = useCallback(async (
    selectedPlotIds: string[],
    format: 'parquet' | 'csv',
    codeStyle: 'plotly' | 'matplotlib'
  ) => {
    // Get the selected plots
    const selectedPlots = plots.filter((p) => selectedPlotIds.includes(p.id));
    if (selectedPlots.length === 0) return;

    // Collect all unique files used by selected plots
    const allFiles = new Set<string>();
    selectedPlots.forEach((plot) => {
      plot.selectedFiles.forEach((f) => allFiles.add(f));
    });

    // Build plots config for export
    const plotsExport: PlotConfigExport[] = selectedPlots.map((p) => ({
      id: p.id,
      name: p.name,
      selected_files: p.selectedFiles,
      selected_cycles: p.selectedCycles,
      settings: JSON.parse(JSON.stringify(p.settings)),
    }));

    // Build file metadata for export
    const fileMetadata: Record<string, Record<string, unknown>> = {};
    for (const filename of allFiles) {
      const file = files.find((f) => f.filename === filename);
      if (file) {
        fileMetadata[filename] = {
          label: file.label,
          ...customColumns[filename],
        };
      }
    }

    try {
      const blob = await exportSession({
        files: Array.from(allFiles),
        format,
        code_style: codeStyle,
        plots: plotsExport,
        file_metadata: fileMetadata,
      });

      // Download the blob
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `echem_export_${format}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      // Error handled by useApi
      console.error('Export failed:', e);
    }
  }, [plots, files, customColumns, exportSession]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Header */}
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Electrochemistry Data Viewer
            </Typography>
            {stats && (
              <Tooltip title={`Memory: ~${stats.memory_mb}MB`}>
                <Chip
                  label={`${stats.file_count}/${stats.max_files} files`}
                  size="small"
                  color={stats.files_remaining < 10 ? 'warning' : 'default'}
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                />
              </Tooltip>
            )}
          </Toolbar>
        </AppBar>

        {/* Main Content */}
        <Container maxWidth="xl" sx={{ mt: 3, mb: 3, flex: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* File Table */}
            <Box>
              {files.length > 0 && (
                <Typography variant="h6" gutterBottom>
                  Loaded Files ({filteredFiles.length}{activeTechnique !== 'all' ? ` - ${activeTechnique}` : ''})
                </Typography>
              )}
              <FileTable
                files={filteredFiles}
                selectedFiles={selectedFiles}
                onSelectionChange={handleSelectionChange}
                onLabelChange={handleLabelChange}
                onDeleteSelected={handleDeleteSelected}
                onUpload={handleUpload}
                onCustomColumnAdd={handleAddCustomColumn}
                onCustomColumnRename={handleRenameCustomColumn}
                onCustomColumnDelete={handleDeleteCustomColumn}
                onCustomCellChange={handleCustomCellChange}
                customColumns={customColumns}
                selectedCycles={selectedCycles}
                onCyclesChange={handleFileCyclesChange}
              />
            </Box>

            {/* Chart Section */}
            <Box>
              <TechniqueTabs
                files={files}
                activeTechnique={activeTechnique}
                onTechniqueChange={handleTechniqueChange}
              />
              <Box sx={{ display: 'flex', gap: 2 }}>
                {/* Left column: PlotsList + ExportPanel + Sidebar */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: 280, flexShrink: 0 }}>
                  <PlotsList
                    plots={plots}
                    activePlotId={activePlotId}
                    hasUnsavedChanges={hasUnsavedChanges()}
                    onSavePlot={handleSavePlot}
                    onSwitchPlot={handleSwitchPlot}
                    onNewPlot={handleNewPlot}
                    onRenamePlot={handleRenamePlot}
                    onDeletePlot={handleDeletePlot}
                    onDuplicatePlot={handleDuplicatePlot}
                  />
                  <ExportPanel
                    plots={plots}
                    onExport={handleExport}
                  />
                  <Sidebar
                    settings={chartSettings}
                    onSettingsChange={handleSettingsChange}
                    availableColumns={availableColumns}
                    customColumns={customColumns}
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Chart
                    files={filteredFiles}
                    selectedFiles={selectedFiles}
                    settings={chartSettings}
                    getData={handleGetData}
                    selectedCycles={selectedCycles}
                    customColumns={customColumns}
                  />
                </Box>
              </Box>
            </Box>
          </Box>
        </Container>

        {/* Unsaved Changes Dialog */}
        <Dialog open={unsavedChangesDialog.open} onClose={handleUnsavedDialogCancel}>
          <DialogTitle>Unsaved Changes</DialogTitle>
          <DialogContent>
            <DialogContentText>
              You have unsaved changes to {activePlot ? `"${activePlot.name}"` : 'the current plot'}.
              What would you like to do?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleUnsavedDialogCancel}>Cancel</Button>
            <Button onClick={handleUnsavedDialogDiscard} color="warning">
              Discard
            </Button>
            <Button onClick={handleUnsavedDialogSave} variant="contained">
              Save Changes
            </Button>
          </DialogActions>
        </Dialog>

        {/* Error Snackbar */}
        <Snackbar open={!!error} autoHideDuration={6000} onClose={clearError}>
          <Alert onClose={clearError} severity="error" sx={{ width: '100%' }}>
            {error}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default App;
