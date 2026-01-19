import { Box, Slider, Typography } from '@mui/material';

interface SettingSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  showValue?: boolean;
  valueSuffix?: string;
}

export function SettingSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  showValue = true,
  valueSuffix = '',
}: SettingSliderProps) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        {showValue && (
          <Typography variant="body2" color="text.primary">
            {value}{valueSuffix}
          </Typography>
        )}
      </Box>
      <Slider
        size="small"
        value={value}
        onChange={(_, v) => onChange(v as number)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
    </Box>
  );
}
