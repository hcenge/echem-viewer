import { useMemo } from 'react';
import { Tabs, Tab, Box } from '@mui/material';
import type { FileInfo } from '../types/api';

interface TechniqueTabsProps {
  files: FileInfo[];
  activeTechnique: string | 'all';
  onTechniqueChange: (technique: string | 'all') => void;
}

export function TechniqueTabs({
  files,
  activeTechnique,
  onTechniqueChange,
}: TechniqueTabsProps) {
  // Get unique techniques from loaded files
  const techniques = useMemo(() => {
    const techSet = new Set<string>();
    files.forEach((f) => {
      if (f.technique) {
        techSet.add(f.technique);
      }
    });
    return Array.from(techSet).sort();
  }, [files]);

  // Don't render if no files or only one technique
  if (files.length === 0) {
    return null;
  }

  const handleChange = (_: React.SyntheticEvent, value: string) => {
    onTechniqueChange(value as string | 'all');
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
      <Tabs
        value={activeTechnique}
        onChange={handleChange}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label="All" value="all" />
        {techniques.map((technique) => (
          <Tab key={technique} label={technique} value={technique} />
        ))}
      </Tabs>
    </Box>
  );
}
