/**
 * Main XAS content container - wraps XAS workflow components.
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, Alert, Snackbar, Typography } from '@mui/material';
import { XASProvider, useXAS } from '../../contexts/XASContext';
import { ProjectSelector } from './ProjectSelector';
import { XASSidebar } from './XASSidebar';
import { NormalizationControls } from './NormalizationControls';
import { AveragingPanel } from './AveragingPanel';
import { XASChart, type ChartMode } from './XASChart';

function XASContentInner() {
  const { error, clearError, goToNextScan, goToPrevScan } = useXAS();
  const [chartMode, setChartMode] = useState<ChartMode>('normalized');

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if user is typing in an input field
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Scan navigation
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      goToNextScan();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      goToPrevScan();
    }
    // Chart mode shortcuts
    else if (e.key === 'n') {
      setChartMode('normalized');
    } else if (e.key === 'f') {
      setChartMode('preedge_fit');
    } else if (e.key === 'r') {
      setChartMode('raw');
    }
  }, [goToNextScan, goToPrevScan]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Project selector */}
      <ProjectSelector />

      {/* Main content area */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        {/* Left sidebar - navigation */}
        <XASSidebar />

        {/* Center - chart */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <XASChart mode={chartMode} onModeChange={setChartMode} />
        </Box>

        {/* Right sidebar - normalization controls and averaging */}
        <Box sx={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
          <NormalizationControls />
          <AveragingPanel />
        </Box>
      </Box>

      {/* Keyboard shortcuts hint */}
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
        Shortcuts: ←/→ navigate scans | N normalized | F fit | R raw
      </Typography>

      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={clearError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={clearError} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export function XASContent() {
  return (
    <XASProvider>
      <XASContentInner />
    </XASProvider>
  );
}
