import { TextField } from '@mui/material';

interface SettingNumberProps {
  label: string;
  value: number | '';
  onChange: (value: number | '') => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
}

export function SettingNumber({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  placeholder,
}: SettingNumberProps) {
  return (
    <TextField
      size="small"
      label={label}
      type="number"
      value={value}
      onChange={(e) => {
        const val = e.target.value;
        if (val === '') {
          onChange('');
        } else {
          const num = parseFloat(val);
          if (!isNaN(num)) {
            onChange(num);
          }
        }
      }}
      disabled={disabled}
      placeholder={placeholder}
      slotProps={{
        htmlInput: { min, max, step },
      }}
    />
  );
}
