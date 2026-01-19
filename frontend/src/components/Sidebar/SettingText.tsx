import { TextField } from '@mui/material';

interface SettingTextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SettingText({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: SettingTextProps) {
  return (
    <TextField
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
