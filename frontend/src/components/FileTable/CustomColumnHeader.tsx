import { useState } from 'react';
import { Box, TextField, IconButton } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

interface CustomColumnHeaderProps {
  name: string;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}

export function CustomColumnHeader({
  name,
  onRename,
  onDelete,
}: CustomColumnHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);

  const startEditing = () => {
    setEditValue(name);
    setIsEditing(true);
  };

  const confirmRename = () => {
    if (editValue.trim() && editValue.trim() !== name) {
      onRename(name, editValue.trim());
    }
    setIsEditing(false);
  };

  const cancelRename = () => {
    setIsEditing(false);
    setEditValue(name);
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
            if (e.key === 'Enter') confirmRename();
            if (e.key === 'Escape') cancelRename();
          }}
          autoFocus
          sx={{ minWidth: 80 }}
          InputProps={{ sx: { fontWeight: 500 } }}
        />
        <IconButton size="small" onClick={confirmRename} sx={{ p: 0.25 }}>
          <CheckIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={cancelRename} sx={{ p: 0.25 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {name}
      <IconButton
        size="small"
        onClick={startEditing}
        sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1 } }}
      >
        <EditIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={() => onDelete(name)}
        sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1 } }}
      >
        <DeleteIcon fontSize="small" color="error" />
      </IconButton>
    </Box>
  );
}
