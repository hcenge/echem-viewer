/**
 * XAS Sidebar - Navigation and scan selection.
 */

import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Typography,
  IconButton,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Divider,
} from '@mui/material';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { useXAS } from '../../contexts/XASContext';

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
  } = useXAS();

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
    <Paper sx={{ p: 2, width: 280, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Sample selector */}
      <FormControl size="small" fullWidth>
        <InputLabel>Sample</InputLabel>
        <Select
          value={selectedSample || ''}
          label="Sample"
          onChange={(e) => selectSample(e.target.value || null)}
        >
          <MenuItem value="">
            <em>Select sample...</em>
          </MenuItem>
          {samples.map((sample) => (
            <MenuItem key={sample} value={sample}>
              {sample}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Dataset list */}
      {selectedSample && (
        <>
          <Typography variant="subtitle2" color="text.secondary">
            Datasets
          </Typography>
          <List dense sx={{ maxHeight: 200, overflow: 'auto', bgcolor: 'grey.50', borderRadius: 1 }}>
            {datasets.map((ds) => (
              <ListItemButton
                key={ds.dataset}
                selected={ds.dataset === selectedDataset}
                onClick={() => selectDataset(ds.dataset)}
              >
                <ListItemText
                  primary={ds.dataset}
                  secondary={`${ds.h5_files.length} files`}
                />
              </ListItemButton>
            ))}
            {datasets.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                No datasets found
              </Typography>
            )}
          </List>
        </>
      )}

      <Divider />

      {/* ROI selector */}
      <FormControl size="small" fullWidth>
        <InputLabel>ROI / Channel</InputLabel>
        <Select
          value={selectedROI || ''}
          label="ROI / Channel"
          onChange={(e) => selectROI(e.target.value || null)}
          disabled={!selectedDataset}
        >
          <MenuItem value="">
            <em>{selectedDataset ? 'Select ROI...' : 'Select dataset first'}</em>
          </MenuItem>
          {validROIs.map((roi) => (
            <MenuItem key={roi.name} value={roi.name}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                <span>{roi.name}</span>
                {roi.valid_scan_count && (
                  <Chip
                    label={`${roi.valid_scan_count}`}
                    size="small"
                    variant="outlined"
                    sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                  />
                )}
              </Box>
            </MenuItem>
          ))}
          {validROIs.length === 0 && selectedDataset && (
            <MenuItem disabled>
              <em>No ROIs with data</em>
            </MenuItem>
          )}
        </Select>
      </FormControl>
      {selectedDataset && validROIs.length === 0 && (
        <Typography variant="caption" color="error">
          No ROI channels have data in this dataset
        </Typography>
      )}

      <Divider />

      {/* Scan navigation */}
      {selectedDataset && selectedROI && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" color="text.secondary">
              Scans ({scans.length})
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton
                size="small"
                onClick={goToPrevScan}
                disabled={currentScanIndex <= 0}
              >
                <NavigateBeforeIcon />
              </IconButton>
              <Chip
                label={selectedScan || '—'}
                size="small"
                sx={{ minWidth: 60 }}
              />
              <IconButton
                size="small"
                onClick={goToNextScan}
                disabled={currentScanIndex >= scans.length - 1}
              >
                <NavigateNextIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Scan status indicator */}
          {selectedScan && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {getStatusIcon(currentScanParams?.status)}
              <Typography variant="body2">
                {currentScanParams?.status || 'Unreviewed'}
              </Typography>
              {currentScanIndex >= 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  {currentScanIndex + 1} / {scans.length}
                </Typography>
              )}
            </Box>
          )}

          {/* Scan list */}
          <List dense sx={{ maxHeight: 300, overflow: 'auto', bgcolor: 'grey.50', borderRadius: 1 }}>
            {scans.map((scan) => (
              <ListItemButton
                key={scan}
                selected={scan === selectedScan}
                onClick={() => selectScan(scan)}
                sx={{ py: 0.5 }}
              >
                <ListItemText primary={scan} />
              </ListItemButton>
            ))}
            {scans.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                No valid scans
              </Typography>
            )}
          </List>
        </>
      )}
    </Paper>
  );
}
