/**
 * Averaging panel for XAS data - shows averaged result and quality analysis.
 */

import { useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Divider,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useXAS } from '../../contexts/XASContext';

export function AveragingPanel() {
  const {
    isProjectOpen,
    selectedSample,
    selectedDataset,
    selectedROI,
    scans,
    averagedData,
    averagingLoading,
    normParams,
    fetchAveragedData,
    applyParamsToAllScans,
    loading,
  } = useXAS();

  // Handle bulk apply with "good" status
  const handleApplyToAll = useCallback(async () => {
    await applyParamsToAllScans('good');
    // Refresh averaged data after applying
    await fetchAveragedData();
  }, [applyParamsToAllScans, fetchAveragedData]);

  if (!isProjectOpen || !selectedDataset || !selectedROI) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Select a dataset to view averaging options
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle1" fontWeight="medium">
        Dataset Averaging
      </Typography>

      {/* Bulk apply section */}
      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Apply current normalization to all {scans.length} scans:
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Tooltip title="Apply current pre-edge/post-edge params to all scans and mark as 'good'">
            <Button
              variant="outlined"
              size="small"
              startIcon={<PlaylistAddCheckIcon />}
              onClick={handleApplyToAll}
              disabled={loading || scans.length === 0}
            >
              Apply to All & Mark Good
            </Button>
          </Tooltip>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Params: pre1={normParams.pre1}, pre2={normParams.pre2}, norm1={normParams.norm1}, norm2={normParams.norm2}
        </Typography>
      </Box>

      <Divider />

      {/* View averaged result */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Averaged Result
          </Typography>
          <Button
            variant="text"
            size="small"
            startIcon={averagingLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={fetchAveragedData}
            disabled={averagingLoading}
          >
            {averagingLoading ? 'Loading...' : 'Calculate'}
          </Button>
        </Box>

        {averagedData ? (
          <Box>
            {/* Summary stats */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
              <Chip
                label={`${averagedData.n_scans} scans`}
                size="small"
                color="primary"
                variant="outlined"
              />
              <Chip
                label={`E0: ${averagedData.e0.toFixed(1)} eV`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Mean σ: ${(averagedData.mean_std * 1000).toFixed(3)}`}
                size="small"
                color={averagedData.mean_std < 0.01 ? 'success' : 'warning'}
                variant="outlined"
              />
            </Box>

            {/* Quality analysis */}
            {averagedData.contributions && averagedData.contributions.length > 1 && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Scan Quality Analysis
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Shows how each scan affects the overall standard deviation
                </Typography>
                <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
                  {averagedData.contributions
                    .sort((a, b) => b.improvement - a.improvement)
                    .map((contrib) => (
                      <ListItem key={contrib.scan_key} sx={{ py: 0.25 }}>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ minWidth: 50 }}>
                                {contrib.scan_key}
                              </Typography>
                              {contrib.improvement > 0.0001 ? (
                                <Tooltip title="Removing this scan would reduce std">
                                  <TrendingDownIcon color="error" fontSize="small" />
                                </Tooltip>
                              ) : contrib.improvement < -0.0001 ? (
                                <Tooltip title="This scan helps reduce std">
                                  <TrendingUpIcon color="success" fontSize="small" />
                                </Tooltip>
                              ) : null}
                            </Box>
                          }
                          secondary={
                            <Typography variant="caption" color="text.secondary">
                              σ without: {(contrib.mean_std_without * 1000).toFixed(3)}
                              {contrib.improvement !== 0 && (
                                <span style={{
                                  color: contrib.improvement > 0 ? '#d32f2f' : '#2e7d32',
                                  marginLeft: 8
                                }}>
                                  ({contrib.improvement > 0 ? '+' : ''}{(contrib.improvement * 1000).toFixed(3)})
                                </span>
                              )}
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                </List>
              </Box>
            )}
          </Box>
        ) : (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Click "Calculate" to see averaged result. At least one scan must be marked as "good".
          </Alert>
        )}
      </Box>
    </Paper>
  );
}
