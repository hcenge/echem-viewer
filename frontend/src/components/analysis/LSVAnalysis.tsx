import { useState } from 'react';
import { TextField } from '@mui/material';
import { AnalysisBase } from './AnalysisBase';

interface LSVAnalysisProps {
  onRun: (params: Record<string, unknown>) => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function LSVAnalysis({ onRun, loading, disabled, disabledReason }: LSVAnalysisProps) {
  const [thresholdCurrent, setThresholdCurrent] = useState('');
  const [targetPotential, setTargetPotential] = useState('');

  const handleRun = () => {
    const params: Record<string, unknown> = {};
    if (thresholdCurrent) params.threshold_current = parseFloat(thresholdCurrent);
    if (targetPotential) params.target_potential = parseFloat(targetPotential);
    onRun(params);
  };

  return (
    <AnalysisBase
      title="LSV Analysis"
      description="Calculates limiting current, onset potential, and current at target potential"
      onRun={handleRun}
      loading={loading}
      disabled={disabled}
      disabledReason={disabledReason}
    >
      <TextField
        label="Threshold current (A)"
        size="small"
        type="number"
        value={thresholdCurrent}
        onChange={(e) => setThresholdCurrent(e.target.value)}
        sx={{ width: 160 }}
        helperText="For onset potential"
      />
      <TextField
        label="Target potential (V)"
        size="small"
        type="number"
        value={targetPotential}
        onChange={(e) => setTargetPotential(e.target.value)}
        sx={{ width: 160 }}
        helperText="For current lookup"
      />
    </AnalysisBase>
  );
}
