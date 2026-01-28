import { useState } from 'react';
import { Box, TextField } from '@mui/material';
import { AnalysisBase } from './AnalysisBase';

interface CPAnalysisProps {
  onRun: (params: Record<string, unknown>) => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function CPAnalysis({ onRun, loading, disabled, disabledReason }: CPAnalysisProps) {
  const [tStart, setTStart] = useState('');
  const [tEnd, setTEnd] = useState('');
  const [targetCurrent, setTargetCurrent] = useState('');

  const handleRun = () => {
    const params: Record<string, unknown> = {};
    if (tStart) params.t_start = parseFloat(tStart);
    if (tEnd) params.t_end = parseFloat(tEnd);
    if (targetCurrent) params.target_current = parseFloat(targetCurrent);
    onRun(params);
  };

  return (
    <AnalysisBase
      title="CP Analysis"
      description="Calculates average potential and overpotential at target current"
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
        />
        <TextField
          label="t_end (s)"
          size="small"
          type="number"
          value={tEnd}
          onChange={(e) => setTEnd(e.target.value)}
          sx={{ width: 100 }}
        />
      </Box>
      <TextField
        label="Target current (A)"
        size="small"
        type="number"
        value={targetCurrent}
        onChange={(e) => setTargetCurrent(e.target.value)}
        sx={{ width: 140 }}
        placeholder="optional"
      />
    </AnalysisBase>
  );
}
