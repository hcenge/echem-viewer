import { useState, useEffect, useCallback, useMemo } from 'react';
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
} from '@mui/material';
import { useApi } from './hooks/useApi';
import { FileTable } from './components/FileTable/index';
import { Chart } from './components/Chart';
import { TechniqueTabs } from './components/TechniqueTabs';
import { Sidebar } from './components/Sidebar/index';
import type { ChartSettings } from './components/Chart';
import { CHART_DEFAULTS } from './constants/chart';
import type { FileInfo, DataResponse } from './types/api';

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
  } = useApi();

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [customColumns, setCustomColumns] = useState<Record<string, Record<string, unknown>>>({});
  const [techniqueDefaults, setTechniqueDefaults] = useState<Record<string, { x: string; y: string }>>({});
  const [activeTechnique, setActiveTechnique] = useState<string | 'all'>('all');
  const [chartSettings, setChartSettings] = useState<ChartSettings>({ ...CHART_DEFAULTS });
  // Per-file cycle selection (filename -> selected cycles)
  const [selectedCycles, setSelectedCycles] = useState<Record<string, number[]>>({});

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
    } catch {
      // Error handled by useApi
    }
  }, [listFiles]);

  useEffect(() => {
    refreshFiles();
    // Fetch technique defaults
    getTechniques()
      .then((data) => setTechniqueDefaults(data.defaults))
      .catch(() => {/* ignore */});
  }, [refreshFiles, getTechniques]);

  // Handle file upload
  const handleUpload = async (filesToUpload: File[]) => {
    await uploadFiles(filesToUpload);
    await refreshFiles();
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

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Header */}
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div">
              Electrochemistry Data Viewer
            </Typography>
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
                <Sidebar
                  settings={chartSettings}
                  onSettingsChange={handleSettingsChange}
                  availableColumns={availableColumns}
                  customColumns={customColumns}
                />
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
