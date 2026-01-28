import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  IconButton,
  Tooltip,
  Paper,
} from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';

export interface AnalysisResultData {
  technique: string;
  results: Record<string, Record<string, number>>;
}

interface AnalysisResultsProps {
  data: AnalysisResultData | null;
  onCopyToTable?: (columnName: string, values: Record<string, string>) => void;
}

// Format numbers for display
function formatValue(value: number): string {
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
    return value.toExponential(3);
  }
  return value.toPrecision(4);
}

// Get a friendly column name for display
function friendlyName(key: string): string {
  const names: Record<string, string> = {
    hf_intercept_ohm: 'HF Intercept',
    lf_intercept_ohm: 'LF Intercept',
    r_ct_ohm: 'R_ct',
    avg_current_A: 'Avg Current (A)',
    avg_current_mA: 'Avg Current (mA)',
    charge_C: 'Charge (C)',
    charge_mC: 'Charge (mC)',
    avg_potential_V: 'Avg Potential (V)',
    overpotential_V: 'Overpotential (V)',
    onset_potential_V: 'Onset (V)',
    limiting_current_A: 'I_lim (A)',
    limiting_current_mA: 'I_lim (mA)',
    current_at_potential_A: 'I @ V (A)',
    current_at_potential_mA: 'I @ V (mA)',
    steady_state_V: 'Steady State (V)',
  };
  return names[key] || key;
}

export function AnalysisResults({ data, onCopyToTable }: AnalysisResultsProps) {
  if (!data || Object.keys(data.results).length === 0) {
    return null;
  }

  // Get all unique result keys across all files
  const allKeys = new Set<string>();
  Object.values(data.results).forEach((fileResults) => {
    Object.keys(fileResults).forEach((key) => allKeys.add(key));
  });
  const resultKeys = Array.from(allKeys);

  // Get filenames
  const filenames = Object.keys(data.results);

  // Handle copy to table
  const handleCopyToTable = (key: string) => {
    if (!onCopyToTable) return;

    const values: Record<string, string> = {};
    for (const [filename, fileResults] of Object.entries(data.results)) {
      if (key in fileResults) {
        values[filename] = formatValue(fileResults[key]);
      }
    }
    onCopyToTable(friendlyName(key), values);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Results
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>File</TableCell>
              {resultKeys.map((key) => (
                <TableCell key={key} sx={{ fontWeight: 'bold' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {friendlyName(key)}
                    {onCopyToTable && (
                      <Tooltip title="Copy to file table">
                        <IconButton size="small" onClick={() => handleCopyToTable(key)}>
                          <TableChartIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filenames.map((filename) => (
              <TableRow key={filename} hover>
                <TableCell sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <Tooltip title={filename}>
                    <span>{filename}</span>
                  </Tooltip>
                </TableCell>
                {resultKeys.map((key) => (
                  <TableCell key={key}>
                    {data.results[filename][key] !== undefined
                      ? formatValue(data.results[filename][key])
                      : '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
