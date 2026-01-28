import { FormControl, MenuItem, Select, ListItemIcon } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import type { SelectChangeEvent } from '@mui/material';
import type { FileInfo } from '../../types/api';

interface LinkedPEISSelectorProps {
  value: string;
  peisFiles: FileInfo[];
  onChange: (filename: string) => void;
}

/**
 * Dropdown selector for linking a file to a PEIS file for iR correction.
 * Shows available PEIS files with their R_s value if available.
 */
export function LinkedPEISSelector({
  value,
  peisFiles,
  onChange,
}: LinkedPEISSelectorProps) {
  const handleChange = (event: SelectChangeEvent<string>) => {
    onChange(event.target.value);
  };

  return (
    <FormControl size="small" fullWidth sx={{ minWidth: 120 }}>
      <Select
        value={value || ''}
        onChange={handleChange}
        displayEmpty
        sx={{
          fontSize: '0.85rem',
          '& .MuiSelect-select': { py: 0.5 },
        }}
      >
        <MenuItem value="">
          <em>None</em>
        </MenuItem>
        {peisFiles.map((file) => (
          <MenuItem
            key={file.filename}
            value={file.filename}
            sx={{
              bgcolor: value === file.filename ? 'action.selected' : undefined,
            }}
          >
            {value === file.filename && (
              <ListItemIcon sx={{ minWidth: 28 }}>
                <CheckIcon fontSize="small" color="primary" />
              </ListItemIcon>
            )}
            {file.filename}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
