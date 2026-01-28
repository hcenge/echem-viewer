import { useState, useCallback } from 'react';
import { Box, Paper, Typography, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import { EISAnalysis } from './EISAnalysis';
import { CAAnalysis } from './CAAnalysis';
import { CPAnalysis } from './CPAnalysis';
import { LSVAnalysis } from './LSVAnalysis';
import { OCVAnalysis } from './OCVAnalysis';
import { CVAnalysis } from './CVAnalysis';
import { AnalysisResults } from './AnalysisResults';
import type { AnalysisResultData } from './AnalysisResults';

// API base URL
const API_BASE = import.meta.env.DEV ? 'http://localhost:8000' : '';

interface AnalysisPanelProps {
  technique: string;
  selectedFiles: string[];
  onCopyToTable?: (columnName: string, values: Record<string, string>) => void;
}

export function AnalysisPanel({ technique, selectedFiles, onCopyToTable }: AnalysisPanelProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnalysisResultData | null>(null);
  const [expanded, setExpanded] = useState(true);

  const runAnalysis = useCallback(
    async (params: Record<string, unknown>) => {
      if (selectedFiles.length === 0) return;

      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/analysis/${technique}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: selectedFiles,
            ...params,
          }),
        });

        if (!response.ok) {
          throw new Error('Analysis failed');
        }

        const data = await response.json();
        setResults(data);
      } catch (error) {
        console.error('Analysis error:', error);
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [technique, selectedFiles]
  );

  // Check if technique has analysis
  const supportedTechniques = ['PEIS', 'GEIS', 'EIS', 'CA', 'CP', 'LSV', 'OCV', 'CV'];
  if (!supportedTechniques.includes(technique)) {
    return null;
  }

  const disabled = selectedFiles.length === 0;
  const disabledReason = disabled ? 'Select files first' : undefined;

  const renderTechniqueComponent = () => {
    const props = { onRun: runAnalysis, loading, disabled, disabledReason };

    switch (technique) {
      case 'PEIS':
      case 'GEIS':
      case 'EIS':
        return <EISAnalysis {...props} />;
      case 'CA':
        return <CAAnalysis {...props} />;
      case 'CP':
        return <CPAnalysis {...props} />;
      case 'LSV':
        return <LSVAnalysis {...props} />;
      case 'OCV':
        return <OCVAnalysis {...props} />;
      case 'CV':
        return <CVAnalysis {...props} />;
      default:
        return null;
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          mb: expanded ? 1 : 0,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Typography variant="subtitle2" color="text.secondary">
          Analysis Tools
        </Typography>
        {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Box>

      <Collapse in={expanded}>
        {renderTechniqueComponent()}
        <AnalysisResults data={results} onCopyToTable={onCopyToTable} />
      </Collapse>
    </Paper>
  );
}

// Re-export for convenience
export { AnalysisResults } from './AnalysisResults';
export type { AnalysisResultData } from './AnalysisResults';
