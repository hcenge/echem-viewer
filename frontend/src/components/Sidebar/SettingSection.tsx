import { Accordion, AccordionSummary, AccordionDetails, Typography, Box } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { ReactNode } from 'react';

interface SettingSectionProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}

export function SettingSection({
  title,
  children,
  defaultExpanded = false,
}: SettingSectionProps) {
  return (
    <Accordion defaultExpanded={defaultExpanded}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">{title}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {children}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
