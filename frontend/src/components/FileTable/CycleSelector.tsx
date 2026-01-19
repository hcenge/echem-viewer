import {
  Checkbox,
  FormControl,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';

interface CycleSelectorProps {
  availableCycles: number[];
  selectedCycles: number[];
  onChange: (cycles: number[]) => void;
}

export function CycleSelector({
  availableCycles,
  selectedCycles,
  onChange,
}: CycleSelectorProps) {
  const handleChange = (event: SelectChangeEvent<number[]>) => {
    const value = event.target.value;
    const cycles = typeof value === 'string' ? value.split(',').map(Number) : value;
    onChange(cycles);
  };

  return (
    <FormControl size="small" sx={{ minWidth: 100 }}>
      <Select
        multiple
        value={selectedCycles}
        onChange={handleChange}
        input={<OutlinedInput sx={{ height: 32 }} />}
        renderValue={(selected) =>
          selected.length === availableCycles.length ? 'All' : selected.join(', ')
        }
        MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}
      >
        {availableCycles.map((cycle) => (
          <MenuItem key={cycle} value={cycle} dense>
            <Checkbox checked={selectedCycles.includes(cycle)} size="small" />
            <ListItemText primary={cycle} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
