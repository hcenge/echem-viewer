import { FormControlLabel, Switch } from '@mui/material';

interface SettingToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SettingToggle({
  label,
  checked,
  onChange,
  disabled = false,
}: SettingToggleProps) {
  return (
    <FormControlLabel
      control={
        <Switch
          size="small"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
      }
      label={label}
    />
  );
}
