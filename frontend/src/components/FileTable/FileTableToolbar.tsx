import { useState, useRef } from 'react';
import { Box, Button, IconButton, TextField, Tooltip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import { FileUpload } from '../FileUpload';

interface FileTableToolbarProps {
  showExtendedColumns: boolean;
  onToggleExtendedColumns: () => void;
  selectedCount: number;
  onDeleteSelected: () => void;
  onUpload?: (files: File[]) => Promise<void>;
  onAddColumn?: (name: string) => void;
  onImportCorrelations?: (file: File) => Promise<void>;
}

export function FileTableToolbar({
  showExtendedColumns,
  onToggleExtendedColumns,
  selectedCount,
  onDeleteSelected,
  onUpload,
  onAddColumn,
  onImportCorrelations,
}: FileTableToolbarProps) {
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const correlationsInputRef = useRef<HTMLInputElement>(null);

  const handleCorrelationsFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onImportCorrelations) {
      await onImportCorrelations(file);
    }
    // Reset the input so the same file can be selected again
    if (correlationsInputRef.current) {
      correlationsInputRef.current.value = '';
    }
  };

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

      {onImportCorrelations && (
        <>
          <input
            type="file"
            accept=".csv"
            ref={correlationsInputRef}
            onChange={handleCorrelationsFileChange}
            style={{ display: 'none' }}
          />
          <Tooltip title="Import CSV mapping files to PEIS for iR correction">
            <Button
              size="small"
              startIcon={<LinkIcon />}
              onClick={() => correlationsInputRef.current?.click()}
            >
              Import Correlations
            </Button>
          </Tooltip>
        </>
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
