import { AnalysisBase } from './AnalysisBase';

interface CVAnalysisProps {
  onRun: (params: Record<string, unknown>) => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function CVAnalysis({ onRun, loading, disabled, disabledReason }: CVAnalysisProps) {
  return (
    <AnalysisBase
      title="CV Analysis"
      description="Calculates total charge from current integration"
      onRun={() => onRun({})}
      loading={loading}
      disabled={disabled}
      disabledReason={disabledReason}
    />
  );
}
