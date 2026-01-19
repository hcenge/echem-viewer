import { useState } from 'react';
import { Box, Button, IconButton, TextField, Tooltip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { FileUpload } from '../FileUpload';

interface FileTableToolbarProps {
  showExtendedColumns: boolean;
  onToggleExtendedColumns: () => void;
  selectedCount: number;
  onDeleteSelected: () => void;
  onUpload?: (files: File[]) => Promise<void>;
  onAddColumn?: (name: string) => void;
}

export function FileTableToolbar({
  showExtendedColumns,
  onToggleExtendedColumns,
  selectedCount,
  onDeleteSelected,
  onUpload,
  onAddColumn,
}: FileTableToolbarProps) {
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  const handleAddColumn = () => {
    if (newColumnName.trim() && onAddColumn) {
      onAddColumn(newColumnName.trim());
      setNewColumnName('');
      setAddColumnOpen(false);
    }
  };

  const handleCancel = () => {
    setAddColumnOpen(false);
    setNewColumnName('');
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
      {onUpload && <FileUpload onUpload={onUpload} compact />}

      <Tooltip title={showExtendedColumns ? 'Hide extra columns' : 'Show extra columns'}>
        <IconButton size="small" onClick={onToggleExtendedColumns}>
          {showExtendedColumns ? <VisibilityOffIcon /> : <VisibilityIcon />}
        </IconButton>
      </Tooltip>

      {onAddColumn && !addColumnOpen && (
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setAddColumnOpen(true)}
        >
          Add Column
        </Button>
      )}

      {onAddColumn && addColumnOpen && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <TextField
            size="small"
            variant="outlined"
            placeholder="Column name"
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddColumn();
              if (e.key === 'Escape') handleCancel();
            }}
            autoFocus
            sx={{ width: 150 }}
            InputProps={{ sx: { height: 32 } }}
          />
          <IconButton size="small" onClick={handleAddColumn} color="primary">
            <CheckIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={handleCancel}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {selectedCount > 0 && (
        <Button
          size="small"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={onDeleteSelected}
        >
          Delete Selected ({selectedCount})
        </Button>
      )}
    </Box>
  );
}
