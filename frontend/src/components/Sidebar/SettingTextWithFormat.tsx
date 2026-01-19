import { Box, TextField } from '@mui/material';
import { FontFormatButton } from './FontFormatButton';
import type { FontFormat } from '../../constants/chart';

export type { FontFormat };

interface SettingTextWithFormatProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  format: FontFormat;
  onFormatChange: (format: FontFormat) => void;
  placeholder?: string;
}

export function SettingTextWithFormat({
  label,
  value,
  onChange,
  format,
  onFormatChange,
  placeholder,
}: SettingTextWithFormatProps) {
  return (
    <Box sx={{ position: 'relative' }}>
      <TextField
        size="small"
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        fullWidth
        slotProps={{
          input: {
            endAdornment: (
              <FontFormatButton format={format} onFormatChange={onFormatChange} />
            ),
          },
        }}
      />
    </Box>
  );
}
