import { useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  IconButton,
  Button,
  Paper,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  MoreVert as MoreIcon,
  ContentCopy as DuplicateIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import type { PlotConfig } from '../types/api';
import { EditableCell } from './FileTable/EditableCell';

interface PlotsListProps {
  plots: PlotConfig[];
  activePlotId: string | null;
  hasUnsavedChanges: boolean;
  onSavePlot: () => void;
  onSwitchPlot: (plotId: string) => void;
  onNewPlot: () => void;
  onRenamePlot: (plotId: string, newName: string) => void;
  onDeletePlot: (plotId: string) => void;
  onDuplicatePlot: (plotId: string) => void;
}

export function PlotsList({
  plots,
  activePlotId,
  hasUnsavedChanges,
  onSavePlot,
  onSwitchPlot,
  onNewPlot,
  onRenamePlot,
  onDeletePlot,
  onDuplicatePlot,
}: PlotsListProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuPlotId, setMenuPlotId] = useState<string | null>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, plotId: string) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuPlotId(plotId);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuPlotId(null);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        border: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 400,
      }}
    >
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Saved Plots
        </Typography>
        <Button
          variant="contained"
          size="small"
          fullWidth
          startIcon={activePlotId ? <SaveIcon /> : <AddIcon />}
          onClick={onSavePlot}
          sx={{ mb: 1 }}
        >
          {activePlotId ? 'Update Plot' : 'Save Plot'}
        </Button>
        {activePlotId && (
          <Button
            variant="outlined"
            size="small"
            fullWidth
            startIcon={<AddIcon />}
            onClick={onNewPlot}
          >
            New Plot
          </Button>
        )}
      </Box>

      <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}>
        {plots.length === 0 ? (
          <ListItem>
            <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
              No saved plots yet
            </Typography>
          </ListItem>
        ) : (
          plots.map((plot) => (
            <ListItem
              key={plot.id}
              disablePadding
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  onClick={(e) => handleMenuOpen(e, plot.id)}
                >
                  <MoreIcon fontSize="small" />
                </IconButton>
              }
              sx={{
                bgcolor: plot.id === activePlotId ? 'action.selected' : 'transparent',
              }}
            >
              <ListItemButton
                onClick={() => onSwitchPlot(plot.id)}
                selected={plot.id === activePlotId}
                sx={{ py: 0.5, pr: 5 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      fontWeight: plot.id === activePlotId ? 600 : 400,
                      fontSize: '0.875rem',
                    }}
                  >
                    <EditableCell
                      value={plot.name}
                      onSave={(newName) => onRenamePlot(plot.id, newName)}
                      showEditIcon
                      minWidth={80}
                    />
                  </Box>
                  {plot.id === activePlotId && hasUnsavedChanges && (
                    <Typography variant="caption" color="warning.main">
                      Unsaved changes
                    </Typography>
                  )}
                </Box>
              </ListItemButton>
            </ListItem>
          ))
        )}
      </List>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            if (menuPlotId) onDuplicatePlot(menuPlotId);
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <DuplicateIcon fontSize="small" />
          </ListItemIcon>
          Duplicate
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            if (menuPlotId) onDeletePlot(menuPlotId);
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </Paper>
  );
}
