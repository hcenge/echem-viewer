/**
 * XAS Sidebar - Navigation and scan selection.
 *
 * Keyboard shortcuts (QWEASD):
 * - W/S: Navigate samples
 * - Q/E: Navigate datasets
 * - A/D: Navigate scans
 */

import { useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Chip,
  Divider,
  TextField,
  Autocomplete,
} from '@mui/material';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useXAS } from '../../contexts/XASContext';
import { ChannelSelector } from './ChannelSelector';

export function XASSidebar() {
  const {
    isProjectOpen,
    samples,
    datasets,
    scans,
    validROIs,
    selectedSample,
    selectedDataset,
    selectedROI,
    selectedScan,
    currentScanParams,
    selectSample,
    selectDataset,
    selectROI,
    selectScan,
    goToNextScan,
    goToPrevScan,
    goToNextSample,
    goToPrevSample,
    goToNextDataset,
    goToPrevDataset,
  } = useXAS();

  // Keyboard navigation (QWEASD)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'w':
          e.preventDefault();
          goToPrevSample();
          break;
        case 's':
          e.preventDefault();
          goToNextSample();
          break;
        case 'q':
          e.preventDefault();
          goToPrevDataset();
          break;
        case 'e':
          e.preventDefault();
          goToNextDataset();
          break;
        case 'a':
          e.preventDefault();
          goToPrevScan();
          break;
        case 'd':
          e.preventDefault();
          goToNextScan();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextScan, goToPrevScan, goToNextSample, goToPrevSample, goToNextDataset, goToPrevDataset]);

  // Computed indices for display
  const currentSampleIndex = selectedSample ? samples.indexOf(selectedSample) : -1;
  const currentDatasetIndex = selectedDataset ? datasets.findIndex(d => d.dataset === selectedDataset) : -1;

  if (!isProjectOpen) {
    return (
      <Paper sx={{ p: 2, width: 280 }}>
        <Typography variant="body2" color="text.secondary">
          Open a project to begin
        </Typography>
      </Paper>
    );
  }

  const currentScanIndex = selectedScan ? scans.indexOf(selectedScan) : -1;

  // Get status icon
  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'good':
        return <CheckCircleIcon fontSize="small" color="success" />;
      case 'ignore':
        return <RemoveCircleIcon fontSize="small" color="error" />;
      default:
        return <HelpOutlineIcon fontSize="small" color="disabled" />;
    }
  };

  return (
    <Paper sx={{ p: 2, width: 280, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Navigation Section - Sample, Dataset, Scan */}
      <Typography variant="overline" color="text.secondary" sx={{ mb: -0.5, fontSize: '0.65rem' }}>
        Keys: W/S samples, Q/E datasets, A/D scans
      </Typography>

      {/* Sample selector with W/S navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <IconButton
            size="small"
            onClick={goToPrevSample}
            disabled={currentSampleIndex <= 0}
            sx={{ p: 0.25 }}
            title="W"
          >
            <KeyboardArrowUpIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={goToNextSample}
            disabled={currentSampleIndex >= samples.length - 1}
            sx={{ p: 0.25 }}
            title="S"
          >
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
        </Box>
        <Autocomplete
          size="small"
          options={samples}
          value={selectedSample}
          onChange={(_, value) => selectSample(value)}
          renderInput={(params) => (
            <TextField
              {...params}
              label={`Sample${samples.length > 0 ? ` (${currentSampleIndex + 1}/${samples.length})` : ''}`}
            />
          )}
          fullWidth
          sx={{ flex: 1 }}
        />
      </Box>

      {/* Dataset selector with Q/E navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <IconButton
            size="small"
            onClick={goToPrevDataset}
            disabled={!selectedSample || currentDatasetIndex <= 0}
            sx={{ p: 0.25 }}
            title="Q"
          >
            <KeyboardArrowUpIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={goToNextDataset}
            disabled={!selectedSample || currentDatasetIndex >= datasets.length - 1}
            sx={{ p: 0.25 }}
            title="E"
          >
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
        </Box>
        <Autocomplete
          size="small"
          options={datasets}
          getOptionLabel={(option) => option.dataset}
          value={datasets.find(d => d.dataset === selectedDataset) || null}
          onChange={(_, value) => selectDataset(value?.dataset || null)}
          disabled={!selectedSample}
          renderInput={(params) => (
            <TextField
              {...params}
              label={`Dataset${datasets.length > 0 ? ` (${currentDatasetIndex + 1}/${datasets.length})` : ''}`}
            />
          )}
          renderOption={(props, option) => (
            <Box component="li" {...props} sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span>{option.dataset}</span>
              <Typography variant="caption" color="text.secondary">
                {option.h5_files.length} files
              </Typography>
            </Box>
          )}
          fullWidth
          sx={{ flex: 1 }}
        />
      </Box>

      {/* Scan selector with A/D navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <IconButton
          size="small"
          onClick={goToPrevScan}
          disabled={!selectedDataset || currentScanIndex <= 0}
          title="A"
        >
          <NavigateBeforeIcon fontSize="small" />
        </IconButton>
        <Autocomplete
          size="small"
          options={scans}
          value={selectedScan}
          onChange={(_, value) => selectScan(value)}
          disabled={!selectedDataset}
          renderInput={(params) => (
            <TextField
              {...params}
              label={`Scan${scans.length > 0 ? ` (${currentScanIndex + 1}/${scans.length})` : ''}`}
            />
          )}
          fullWidth
          sx={{ flex: 1 }}
        />
        <IconButton
          size="small"
          onClick={goToNextScan}
          disabled={!selectedDataset || currentScanIndex >= scans.length - 1}
          title="D"
        >
          <NavigateNextIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Scan status indicator */}
      {selectedScan && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1 }}>
          {getStatusIcon(currentScanParams?.status)}
          <Typography variant="body2">
            {currentScanParams?.status || 'Unreviewed'}
          </Typography>
        </Box>
      )}

      <Divider />

      {/* Channel Selection - direct view mode */}
      {selectedDataset && (
        <ChannelSelector />
      )}

      <Divider />

      {/* ROI selector (optional - overrides channel selection) */}
      <Autocomplete
        size="small"
        options={validROIs}
        getOptionLabel={(option) => option.name}
        value={validROIs.find(r => r.name === selectedROI) || null}
        onChange={(_, value) => selectROI(value?.name || null)}
        disabled={!selectedDataset}
        renderInput={(params) => (
          <TextField
            {...params}
            label="ROI (optional)"
            placeholder={selectedDataset ? 'Direct View Mode' : 'Select dataset first'}
          />
        )}
        renderOption={(props, option) => (
          <Box component="li" {...props} sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span>{option.name}</span>
            {option.valid_scan_count && (
              <Chip
                label={`${option.valid_scan_count}`}
                size="small"
                variant="outlined"
                sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
              />
            )}
          </Box>
        )}
        fullWidth
      />
      {selectedDataset && validROIs.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          No saved ROIs - use channel selector above
        </Typography>
      )}
    </Paper>
  );
}
