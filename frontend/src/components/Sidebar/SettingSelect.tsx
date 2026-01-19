import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';

export interface SelectOption {
  value: string;
  label: string;
}

interface SettingSelectProps {
  label: string;
  value: string;
  options: SelectOption[] | string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function SettingSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  fullWidth = true,
}: SettingSelectProps) {
  // Normalize options to SelectOption format
  const normalizedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  return (
    <FormControl size="small" fullWidth={fullWidth} disabled={disabled}>
      <InputLabel>{label}</InputLabel>
      <Select
        value={value}
        label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        {normalizedOptions.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
