import { useState } from 'react';
import { Box, TextField, IconButton } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';

interface EditableCellProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  showEditIcon?: boolean;
  clickToEdit?: boolean;
  minWidth?: number;
  inputProps?: Record<string, unknown>;
}

export function EditableCell({
  value,
  onSave,
  placeholder = '-',
  showEditIcon = true,
  clickToEdit = false,
  minWidth = 80,
  inputProps = {},
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const startEditing = () => {
    setEditValue(value);
    setIsEditing(true);
  };

  const save = () => {
    onSave(editValue);
    setIsEditing(false);
  };

  const cancel = () => {
    setIsEditing(false);
    setEditValue(value);
  };

  if (isEditing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <TextField
          size="small"
          variant="standard"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          autoFocus
          sx={{ minWidth }}
          InputProps={{ sx: { fontSize: 'inherit', ...inputProps } }}
        />
        <IconButton size="small" onClick={save} sx={{ p: 0.25 }}>
          <CheckIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={cancel} sx={{ p: 0.25 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  if (clickToEdit) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          '&:hover': { backgroundColor: 'action.hover' },
          borderRadius: 0.5,
          px: 0.5,
          minHeight: 24,
        }}
        onClick={startEditing}
      >
        {value || <span style={{ opacity: 0.4 }}>{placeholder}</span>}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {value || <span style={{ opacity: 0.4 }}>{placeholder}</span>}
      {showEditIcon && (
        <IconButton
          size="small"
          onClick={startEditing}
          sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1 } }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}
