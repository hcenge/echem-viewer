import { useState } from 'react';
import { Box, TextField } from '@mui/material';
import { AnalysisBase } from './AnalysisBase';

interface CAAnalysisProps {
  onRun: (params: Record<string, unknown>) => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function CAAnalysis({ onRun, loading, disabled, disabledReason }: CAAnalysisProps) {
  const [tStart, setTStart] = useState('');
  const [tEnd, setTEnd] = useState('');

  const handleRun = () => {
    const params: Record<string, unknown> = {};
    if (tStart) params.t_start = parseFloat(tStart);
    if (tEnd) params.t_end = parseFloat(tEnd);
    onRun(params);
  };

  return (
    <AnalysisBase
      title="CA Analysis"
      description="Calculates total charge and average current over time range"
      onRun={handleRun}
      loading={loading}
      disabled={disabled}
      disabledReason={disabledReason}
    >
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label="t_start (s)"
          size="small"
          type="number"
          value={tStart}
          onChange={(e) => setTStart(e.target.value)}
          sx={{ width: 100 }}
          placeholder="0"
        />
        <TextField
          label="t_end (s)"
          size="small"
          type="number"
          value={tEnd}
          onChange={(e) => setTEnd(e.target.value)}
          sx={{ width: 100 }}
          placeholder="end"
        />
      </Box>
    </AnalysisBase>
  );
}
