import { AnalysisBase } from './AnalysisBase';

interface OCVAnalysisProps {
  onRun: (params: Record<string, unknown>) => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function OCVAnalysis({ onRun, loading, disabled, disabledReason }: OCVAnalysisProps) {
  return (
    <AnalysisBase
      title="OCV Analysis"
      description="Calculates steady-state open circuit potential"
      onRun={() => onRun({})}
      loading={loading}
      disabled={disabled}
      disabledReason={disabledReason}
    />
  );
}
