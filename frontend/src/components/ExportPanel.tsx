import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
  Collapse,
  IconButton,
} from '@mui/material';
import {
  Download as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import type { PlotConfig } from '../types/api';

interface ExportPanelProps {
  plots: PlotConfig[];
  onExport: (
    selectedPlotIds: string[],
    format: 'parquet' | 'csv',
    codeStyle: 'plotly' | 'matplotlib'
  ) => Promise<void>;
  disabled?: boolean;
}

export function ExportPanel({ plots, onExport, disabled }: ExportPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedPlotIds, setSelectedPlotIds] = useState<string[]>([]);
  const [format, setFormat] = useState<'parquet' | 'csv'>('parquet');
  const [codeStyle, setCodeStyle] = useState<'plotly' | 'matplotlib'>('plotly');
  const [exporting, setExporting] = useState(false);

  const handleTogglePlot = (plotId: string) => {
    setSelectedPlotIds((prev) =>
      prev.includes(plotId)
        ? prev.filter((id) => id !== plotId)
        : [...prev, plotId]
    );
  };

  const handleSelectAll = () => {
    setSelectedPlotIds(plots.map((p) => p.id));
  };

  const handleSelectNone = () => {
    setSelectedPlotIds([]);
  };

  const handleExport = async () => {
    if (selectedPlotIds.length === 0) return;

    setExporting(true);
    try {
      await onExport(selectedPlotIds, format, codeStyle);
    } finally {
      setExporting(false);
    }
  };

  const canExport = plots.length > 0 && selectedPlotIds.length > 0 && !disabled;

  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
      {/* Header - clickable to expand/collapse */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Typography variant="subtitle2" color="text.secondary">
          Export
        </Typography>
        <IconButton size="small" sx={{ p: 0.25 }}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 1.5 }}>
          {plots.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              Save some plots first to export them.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Plot selection */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" fontWeight={500}>
                    Plots
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Button size="small" onClick={handleSelectAll} sx={{ minWidth: 'auto', px: 1, fontSize: '0.7rem' }}>
                      All
                    </Button>
                    <Button size="small" onClick={handleSelectNone} sx={{ minWidth: 'auto', px: 1, fontSize: '0.7rem' }}>
                      None
                    </Button>
                  </Box>
                </Box>
                <List dense sx={{ maxHeight: 120, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, py: 0 }}>
                  {plots.map((plot) => (
                    <ListItem key={plot.id} disablePadding>
                      <ListItemButton onClick={() => handleTogglePlot(plot.id)} dense sx={{ py: 0 }}>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <Checkbox
                            edge="start"
                            checked={selectedPlotIds.includes(plot.id)}
                            tabIndex={-1}
                            size="small"
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={plot.name}
                          primaryTypographyProps={{ variant: 'caption', noWrap: true }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Box>

              {/* Format options - compact vertical layout */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <FormControl size="small">
                  <FormLabel sx={{ fontSize: '0.75rem', fontWeight: 500, mb: 0.5 }}>
                    Data Format
                  </FormLabel>
                  <RadioGroup
                    value={format}
                    onChange={(e) => setFormat(e.target.value as 'parquet' | 'csv')}
                    row
                  >
                    <FormControlLabel
                      value="parquet"
                      control={<Radio size="small" sx={{ p: 0.5 }} />}
                      label={<Typography variant="caption">Parquet</Typography>}
                      sx={{ mr: 1 }}
                    />
                    <FormControlLabel
                      value="csv"
                      control={<Radio size="small" sx={{ p: 0.5 }} />}
                      label={<Typography variant="caption">CSV</Typography>}
                    />
                  </RadioGroup>
                </FormControl>

                <FormControl size="small">
                  <FormLabel sx={{ fontSize: '0.75rem', fontWeight: 500, mb: 0.5 }}>
                    Code Style
                  </FormLabel>
                  <RadioGroup
                    value={codeStyle}
                    onChange={(e) => setCodeStyle(e.target.value as 'plotly' | 'matplotlib')}
                    row
                  >
                    <FormControlLabel
                      value="plotly"
                      control={<Radio size="small" sx={{ p: 0.5 }} />}
                      label={<Typography variant="caption">Plotly</Typography>}
                      sx={{ mr: 1 }}
                    />
                    <FormControlLabel
                      value="matplotlib"
                      control={<Radio size="small" sx={{ p: 0.5 }} />}
                      label={<Typography variant="caption">Matplotlib</Typography>}
                    />
                  </RadioGroup>
                </FormControl>
              </Box>

              {/* Export button */}
              <Button
                variant="contained"
                size="small"
                fullWidth
                startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon fontSize="small" />}
                onClick={handleExport}
                disabled={!canExport || exporting}
              >
                {exporting ? 'Exporting...' : `Export (${selectedPlotIds.length})`}
              </Button>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
