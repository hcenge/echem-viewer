import { AnalysisBase } from './AnalysisBase';

interface EISAnalysisProps {
  onRun: (params: Record<string, unknown>) => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function EISAnalysis({ onRun, loading, disabled, disabledReason }: EISAnalysisProps) {
  return (
    <AnalysisBase
      title="EIS Analysis"
      description="Calculates HF intercept (solution resistance), LF intercept (total resistance), and charge transfer resistance (R_ct)"
      onRun={() => onRun({})}
      loading={loading}
      disabled={disabled}
      disabledReason={disabledReason}
    />
  );
}
