/**
 * XAS Chart component using Plotly for visualization.
 *
 * Supports two modes:
 * - Direct View Mode: Shows raw H5 data from selected channels
 * - ROI Mode: Shows normalized data from selected ROI configuration
 */

import { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { Box, Paper, Typography, ToggleButtonGroup, ToggleButton, Chip } from '@mui/material';
import { useXAS } from '../../contexts/XASContext';

export type ChartMode = 'normalized' | 'raw' | 'preedge_fit';

interface XASChartProps {
  mode?: ChartMode;
  onModeChange?: (mode: ChartMode) => void;
}

export function XASChart({ mode = 'normalized', onModeChange }: XASChartProps) {
  const {
    currentScanData,
    selectedScan,
    selectedROI,
    normParams,
    isProjectOpen,
    isDirectViewMode,
    directViewData,
    directViewLoading,
  } = useXAS();

  const plotData = useMemo(() => {
    const traces: Plotly.Data[] = [];

    // Direct view mode: show raw channel data
    if (isDirectViewMode && directViewData) {
      traces.push({
        x: directViewData.x,
        y: directViewData.y,
        type: 'scatter',
        mode: 'lines',
        name: directViewData.y_label,
        line: { color: '#1976d2', width: 1.5 },
      });
      return traces;
    }

    // ROI mode: show normalized data
    if (!currentScanData) return [];

    if (mode === 'raw') {
      // Show raw mu
      traces.push({
        x: currentScanData.energy_eV,
        y: currentScanData.mu_raw,
        type: 'scatter',
        mode: 'lines',
        name: 'Raw',
        line: { color: '#1976d2', width: 1.5 },
      });
    } else if (mode === 'normalized') {
      // Show normalized mu
      traces.push({
        x: currentScanData.energy_eV,
        y: currentScanData.mu_norm,
        type: 'scatter',
        mode: 'lines',
        name: 'Normalized',
        line: { color: '#1976d2', width: 1.5 },
      });

      // Add E0 vertical line
      traces.push({
        x: [currentScanData.e0, currentScanData.e0],
        y: [-0.2, 1.5],
        type: 'scatter',
        mode: 'lines',
        name: 'E0',
        line: { color: '#e91e63', width: 1, dash: 'dash' },
        showlegend: true,
      });
    } else if (mode === 'preedge_fit') {
      // Show raw mu with pre-edge and post-edge fits
      traces.push({
        x: currentScanData.energy_eV,
        y: currentScanData.mu_raw,
        type: 'scatter',
        mode: 'lines',
        name: 'Raw',
        line: { color: '#1976d2', width: 1.5 },
      });

      // Pre-edge fit line
      traces.push({
        x: currentScanData.energy_eV,
        y: currentScanData.mu_pre,
        type: 'scatter',
        mode: 'lines',
        name: 'Pre-edge fit',
        line: { color: '#4caf50', width: 1, dash: 'dot' },
      });

      // Post-edge fit line
      traces.push({
        x: currentScanData.energy_eV,
        y: currentScanData.mu_post,
        type: 'scatter',
        mode: 'lines',
        name: 'Post-edge fit',
        line: { color: '#ff9800', width: 1, dash: 'dot' },
      });

      // E0 vertical line
      traces.push({
        x: [currentScanData.e0, currentScanData.e0],
        y: [Math.min(...currentScanData.mu_raw), Math.max(...currentScanData.mu_raw)],
        type: 'scatter',
        mode: 'lines',
        name: 'E0',
        line: { color: '#e91e63', width: 1, dash: 'dash' },
      });

      // Pre-edge region shading
      const preEdgeE0 = currentScanData.e0 + normParams.pre1;
      const preEdgeE1 = currentScanData.e0 + normParams.pre2;
      traces.push({
        x: [preEdgeE0, preEdgeE0, preEdgeE1, preEdgeE1],
        y: [
          Math.min(...currentScanData.mu_raw),
          Math.max(...currentScanData.mu_raw),
          Math.max(...currentScanData.mu_raw),
          Math.min(...currentScanData.mu_raw),
        ],
        type: 'scatter',
        fill: 'toself',
        fillcolor: 'rgba(76, 175, 80, 0.1)',
        line: { width: 0 },
        name: 'Pre-edge region',
        showlegend: false,
      });

      // Post-edge region shading
      const postEdgeE0 = currentScanData.e0 + normParams.norm1;
      const postEdgeE1 = currentScanData.e0 + normParams.norm2;
      traces.push({
        x: [postEdgeE0, postEdgeE0, postEdgeE1, postEdgeE1],
        y: [
          Math.min(...currentScanData.mu_raw),
          Math.max(...currentScanData.mu_raw),
          Math.max(...currentScanData.mu_raw),
          Math.min(...currentScanData.mu_raw),
        ],
        type: 'scatter',
        fill: 'toself',
        fillcolor: 'rgba(255, 152, 0, 0.1)',
        line: { width: 0 },
        name: 'Post-edge region',
        showlegend: false,
      });
    }

    return traces;
  }, [currentScanData, mode, normParams, isDirectViewMode, directViewData]);

  const layout = useMemo((): Partial<Plotly.Layout> => {
    // Use appropriate axis titles based on mode
    let xTitle = 'Energy (eV)';
    let yTitle = mode === 'normalized' ? 'Normalized Absorption' : 'Absorption (arb.)';

    // In direct view mode, use the actual channel labels
    if (isDirectViewMode && directViewData) {
      xTitle = directViewData.x_label;
      yTitle = directViewData.y_label;
    }

    return {
      autosize: true,
      margin: { l: 60, r: 30, t: 30, b: 50 },
      xaxis: {
        title: { text: xTitle },
        showgrid: true,
        gridcolor: '#e0e0e0',
        zeroline: false,
      },
      yaxis: {
        title: { text: yTitle },
        showgrid: true,
        gridcolor: '#e0e0e0',
        zeroline: false,
      },
      legend: {
        x: 1,
        y: 1,
        xanchor: 'right',
        yanchor: 'top',
        bgcolor: 'rgba(255,255,255,0.8)',
      },
      hovermode: 'x unified',
    };
  }, [mode, isDirectViewMode, directViewData]);

  if (!isProjectOpen) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          Open a project to view XAS data
        </Typography>
      </Paper>
    );
  }

  // Check for data based on mode
  const hasData = isDirectViewMode ? directViewData : currentScanData;
  const isLoading = isDirectViewMode ? directViewLoading : !currentScanData && selectedScan;

  if (!hasData) {
    let message = 'Select a scan to view';
    if (isLoading) {
      message = 'Loading scan data...';
    } else if (selectedScan && isDirectViewMode) {
      message = 'Select channels to view data';
    }
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          {message}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 1, position: 'relative' }}>
      {/* Mode indicator */}
      <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
        <Chip
          label={isDirectViewMode ? 'Direct View' : `ROI: ${selectedROI}`}
          size="small"
          color={isDirectViewMode ? 'default' : 'primary'}
          variant="outlined"
        />
      </Box>

      {/* Mode toggle - only show in ROI mode */}
      {onModeChange && !isDirectViewMode && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1, mr: 12 }}>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, newMode) => newMode && onModeChange(newMode)}
            size="small"
          >
            <ToggleButton value="normalized">Normalized</ToggleButton>
            <ToggleButton value="preedge_fit">Pre/Post Fit</ToggleButton>
            <ToggleButton value="raw">Raw</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      <Plot
        data={plotData}
        layout={layout}
        config={{
          responsive: true,
          displayModeBar: true,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        }}
        style={{ width: '100%', height: 450 }}
      />
    </Paper>
  );
}
