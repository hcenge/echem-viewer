import { useState, useEffect } from 'react';
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
  // Local state for immediate visual feedback during drag
  const [localValue, setLocalValue] = useState(value);

  // Sync local value when prop changes from outside
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        {showValue && (
          <Typography variant="body2" color="text.primary">
            {localValue}{valueSuffix}
          </Typography>
        )}
      </Box>
      <Slider
        size="small"
        value={localValue}
        onChange={(_, v) => setLocalValue(v as number)}
        onChangeCommitted={(_, v) => onChange(v as number)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
    </Box>
  );
}
