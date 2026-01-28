import type { ReactNode } from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

interface AnalysisBaseProps {
  title: string;
  description?: string;
  children?: ReactNode;
  onRun: () => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function AnalysisBase({
  title,
  description,
  children,
  onRun,
  loading = false,
  disabled = false,
  disabledReason,
}: AnalysisBaseProps) {
  const canRun = !loading && !disabled;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2">{title}</Typography>

      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
          {description}
        </Typography>
      )}

      {children && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</Box>}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          variant="contained"
          size="small"
          onClick={onRun}
          disabled={!canRun}
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
        >
          {loading ? 'Running...' : 'Run'}
        </Button>

        {disabled && disabledReason && (
          <Typography variant="caption" color="text.secondary">
            {disabledReason}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
