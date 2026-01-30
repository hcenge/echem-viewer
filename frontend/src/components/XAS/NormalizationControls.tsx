/**
 * Normalization controls for XAS data processing.
 */

import { useCallback, useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Slider,
  TextField,
  Button,
  ButtonGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SaveIcon from '@mui/icons-material/Save';
import CodeIcon from '@mui/icons-material/Code';
import { useXAS } from '../../contexts/XASContext';
import { useXASApi } from '../../hooks/useXASApi';
import type { ScanStatus } from '../../types/xas';

export function NormalizationControls() {
  const {
    isProjectOpen,
    selectedSample,
    selectedDataset,
    selectedROI,
    selectedScan,
    currentScanData,
    currentScanParams,
    normParams,
    energyShift,
    references,
    setNormParams,
    setEnergyShift,
    normalizeCurrentScan,
    saveScanParams,
    loading,
  } = useXAS();

  const { exportCode, getReviewProgress } = useXASApi();

  // Local state for smooth slider dragging
  const [localPreEdge, setLocalPreEdge] = useState<[number, number]>([-150, -30]);
  const [localPostEdge, setLocalPostEdge] = useState<[number, number]>([50, 400]);

  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [plottingBackend, setPlottingBackend] = useState<'matplotlib' | 'plotly'>('matplotlib');
  const [exportError, setExportError] = useState<string | null>(null);
  const [canExport, setCanExport] = useState(false);
  const [goodScansCount, setGoodScansCount] = useState(0);

  // Check if export is possible when dataset/ROI changes
  useEffect(() => {
    if (selectedSample && selectedDataset && selectedROI) {
      getReviewProgress(selectedSample, selectedDataset, selectedROI)
        .then((progress) => {
          setCanExport(progress.can_export);
          setGoodScansCount(progress.good);
        })
        .catch(() => {
          setCanExport(false);
          setGoodScansCount(0);
        });
    }
  }, [selectedSample, selectedDataset, selectedROI, getReviewProgress]);

  // Handle export
  const handleExport = useCallback(async () => {
    if (!selectedSample || !selectedDataset || !selectedROI) return;

    setExportError(null);
    try {
      const blob = await exportCode({
        sample: selectedSample,
        dataset: selectedDataset,
        roi: selectedROI,
        plotting_backend: plottingBackend,
        include_derivatives: false,
      });

      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xas_${selectedSample}_${selectedDataset}_${selectedROI}.py`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportDialogOpen(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    }
  }, [selectedSample, selectedDataset, selectedROI, plottingBackend, exportCode]);

  // Sync local state with context when normParams changes (e.g., new scan loaded)
  useEffect(() => {
    if (normParams) {
      setLocalPreEdge([normParams.pre1, normParams.pre2]);
      setLocalPostEdge([normParams.norm1, normParams.norm2]);
    }
  }, [normParams]);

  // Pre-edge slider handlers
  const handlePreEdgeDrag = useCallback((_: Event, newValue: number | number[]) => {
    setLocalPreEdge(newValue as [number, number]);
  }, []);

  const handlePreEdgeCommit = useCallback((_: Event | React.SyntheticEvent, newValue: number | number[]) => {
    const [pre1, pre2] = newValue as [number, number];
    setNormParams({ pre1, pre2 });
  }, [setNormParams]);

  // Post-edge slider handlers
  const handlePostEdgeDrag = useCallback((_: Event, newValue: number | number[]) => {
    setLocalPostEdge(newValue as [number, number]);
  }, []);

  const handlePostEdgeCommit = useCallback((_: Event | React.SyntheticEvent, newValue: number | number[]) => {
    const [norm1, norm2] = newValue as [number, number];
    setNormParams({ norm1, norm2 });
  }, [setNormParams]);

  const handleSave = useCallback(async (status: ScanStatus) => {
    await saveScanParams(status);
  }, [saveScanParams]);

  if (!isProjectOpen || !selectedScan || !normParams) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Select a scan to adjust normalization
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle1" fontWeight="medium">
        Normalization
      </Typography>

      {/* Pre-edge range */}
      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Pre-edge range (eV relative to E0)
        </Typography>
        <Slider
          value={localPreEdge}
          onChange={handlePreEdgeDrag}
          onChangeCommitted={handlePreEdgeCommit}
          min={-500}
          max={0}
          step={5}
          valueLabelDisplay="auto"
          marks={[
            { value: -500, label: '-500' },
            { value: -250, label: '-250' },
            { value: 0, label: '0' },
          ]}
          disabled={loading}
        />
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <TextField
            label="Pre1"
            type="number"
            size="small"
            value={normParams.pre1}
            onChange={(e) => setNormParams({ pre1: Number(e.target.value) })}
            onBlur={() => normalizeCurrentScan()}
            sx={{ width: 80 }}
          />
          <TextField
            label="Pre2"
            type="number"
            size="small"
            value={normParams.pre2}
            onChange={(e) => setNormParams({ pre2: Number(e.target.value) })}
            onBlur={() => normalizeCurrentScan()}
            sx={{ width: 80 }}
          />
        </Box>
      </Box>

      {/* Post-edge range */}
      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Post-edge range (eV relative to E0)
        </Typography>
        <Slider
          value={localPostEdge}
          onChange={handlePostEdgeDrag}
          onChangeCommitted={handlePostEdgeCommit}
          min={0}
          max={800}
          step={10}
          valueLabelDisplay="auto"
          marks={[
            { value: 0, label: '0' },
            { value: 400, label: '400' },
            { value: 800, label: '800' },
          ]}
          disabled={loading}
        />
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          <TextField
            label="Norm1"
            type="number"
            size="small"
            value={normParams.norm1}
            onChange={(e) => setNormParams({ norm1: Number(e.target.value) })}
            onBlur={() => normalizeCurrentScan()}
            sx={{ width: 80 }}
          />
          <TextField
            label="Norm2"
            type="number"
            size="small"
            value={normParams.norm2}
            onChange={(e) => setNormParams({ norm2: Number(e.target.value) })}
            onBlur={() => normalizeCurrentScan()}
            sx={{ width: 80 }}
          />
        </Box>
      </Box>

      <Divider />

      {/* Reference / Energy shift */}
      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Energy Calibration
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Reference</InputLabel>
            <Select
              value=""
              label="Reference"
              onChange={(e) => {
                const ref = references.find(r => r.name === e.target.value);
                if (ref && currentScanData) {
                  // Calculate shift to align E0 with reference
                  const shift = ref.e0 - currentScanData.e0;
                  setEnergyShift(shift);
                  normalizeCurrentScan();
                }
              }}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {references.map((ref) => (
                <MenuItem key={ref.name} value={ref.name}>
                  {ref.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Shift (eV)"
            type="number"
            size="small"
            value={energyShift}
            onChange={(e) => setEnergyShift(Number(e.target.value))}
            onBlur={() => normalizeCurrentScan()}
            sx={{ width: 100 }}
            inputProps={{ step: 0.1 }}
          />
        </Box>
      </Box>

      <Divider />

      {/* E0 and edge step display */}
      {currentScanData && (
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              E0
            </Typography>
            <Typography variant="body2">
              {currentScanData.e0.toFixed(1)} eV
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Edge Step
            </Typography>
            <Typography variant="body2">
              {currentScanData.edge_step.toFixed(4)}
            </Typography>
          </Box>
        </Box>
      )}

      <Divider />

      {/* Status buttons */}
      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Scan Status
        </Typography>
        <ButtonGroup fullWidth size="small">
          <Button
            variant={currentScanParams?.status === 'good' ? 'contained' : 'outlined'}
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={() => handleSave('good')}
            disabled={loading}
          >
            Good
          </Button>
          <Button
            variant={currentScanParams?.status === 'ignore' ? 'contained' : 'outlined'}
            color="error"
            startIcon={<RemoveCircleIcon />}
            onClick={() => handleSave('ignore')}
            disabled={loading}
          >
            Ignore
          </Button>
          <Button
            variant={!currentScanParams?.status || currentScanParams.status === 'unreviewed' ? 'contained' : 'outlined'}
            startIcon={<HelpOutlineIcon />}
            onClick={() => handleSave('unreviewed')}
            disabled={loading}
          >
            Skip
          </Button>
        </ButtonGroup>
      </Box>

      {/* Save button (saves without changing status) */}
      <Button
        variant="outlined"
        startIcon={<SaveIcon />}
        onClick={() => handleSave(currentScanParams?.status || 'unreviewed')}
        disabled={loading}
      >
        Save Parameters
      </Button>

      <Divider />

      {/* Export Code button */}
      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Export Analysis
        </Typography>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<CodeIcon />}
          onClick={() => setExportDialogOpen(true)}
          disabled={!canExport}
          fullWidth
        >
          Export Python Script
        </Button>
        {canExport && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {goodScansCount} scan{goodScansCount !== 1 ? 's' : ''} marked as good
          </Typography>
        )}
        {!canExport && selectedDataset && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Mark at least one scan as "Good" to export
          </Typography>
        )}
      </Box>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)}>
        <DialogTitle>Export Python Script</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Generate a standalone Python script that reproduces this analysis.
            The script can run independently with numpy, h5py, larch, and your chosen plotting library.
          </Typography>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Plotting Library
          </Typography>
          <RadioGroup
            value={plottingBackend}
            onChange={(e) => setPlottingBackend(e.target.value as 'matplotlib' | 'plotly')}
          >
            <FormControlLabel
              value="matplotlib"
              control={<Radio />}
              label="Matplotlib (static, publication-quality)"
            />
            <FormControlLabel
              value="plotly"
              control={<Radio />}
              label="Plotly (interactive HTML)"
            />
          </RadioGroup>

          {exportError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {exportError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleExport} variant="contained" color="primary">
            Download Script
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
