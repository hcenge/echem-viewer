import { useState } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Popover,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import FormatSizeIcon from '@mui/icons-material/FormatSize';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import type { FontFormat } from '../../constants/chart';

interface FontFormatButtonProps {
  format: FontFormat;
  onFormatChange: (format: FontFormat) => void;
}

export function FontFormatButton({ format, onFormatChange }: FontFormatButtonProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleStyleChange = (_: React.MouseEvent<HTMLElement>, newStyles: string[]) => {
    onFormatChange({
      ...format,
      bold: newStyles.includes('bold'),
      italic: newStyles.includes('italic'),
      underline: newStyles.includes('underline'),
    });
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const size = parseInt(e.target.value, 10);
    if (!isNaN(size) && size >= 5 && size <= 100) {
      onFormatChange({ ...format, size });
    }
  };

  const open = Boolean(anchorEl);
  const activeStyles: string[] = [];
  if (format.bold) activeStyles.push('bold');
  if (format.italic) activeStyles.push('italic');
  if (format.underline) activeStyles.push('underline');

  const hasStyles = format.bold || format.italic || format.underline;

  return (
    <>
      <IconButton
        size="small"
        onClick={handleClick}
        sx={{
          p: 0.5,
          color: open || hasStyles ? 'primary.main' : 'text.secondary',
        }}
      >
        <FormatSizeIcon fontSize="small" />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            size="small"
            type="number"
            label="Size"
            value={format.size}
            onChange={handleSizeChange}
            slotProps={{
              htmlInput: { min: 5, max: 100 },
            }}
            sx={{ width: 80 }}
          />
          <ToggleButtonGroup
            value={activeStyles}
            onChange={handleStyleChange}
            size="small"
          >
            <ToggleButton value="bold" aria-label="bold">
              <FormatBoldIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="italic" aria-label="italic">
              <FormatItalicIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="underline" aria-label="underline">
              <FormatUnderlinedIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Popover>
    </>
  );
}
