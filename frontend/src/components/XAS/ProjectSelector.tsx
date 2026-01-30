/**
 * Project selector component for opening XAS project folders.
 */

import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  Typography,
  Chip,
  CircularProgress,
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CloseIcon from '@mui/icons-material/Close';
import { useXAS } from '../../contexts/XASContext';

const BEAMLINES = [
  { value: 'BM23', label: 'ESRF BM23' },
];

export function ProjectSelector() {
  const {
    project,
    isProjectOpen,
    openProject,
    closeProject,
    loading,
  } = useXAS();

  const [projectPath, setProjectPath] = useState('');
  const [beamline, setBeamline] = useState('BM23');

  const handleOpen = async () => {
    if (!projectPath.trim()) return;
    await openProject(projectPath.trim(), beamline);
  };

  const handleClose = async () => {
    await closeProject();
    setProjectPath('');
  };

  if (isProjectOpen && project) {
    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="subtitle1" fontWeight="medium">
              Project Open
            </Typography>
            <Chip
              label={project.beamline}
              size="small"
              color="primary"
              variant="outlined"
            />
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {project.project_path}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Chip
              label={`${project.samples.length} samples`}
              size="small"
            />
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<CloseIcon />}
              onClick={handleClose}
              disabled={loading}
            >
              Close
            </Button>
          </Box>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
        Open XAS Project
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <TextField
          label="Project Path"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="/path/to/beamtime/data"
          size="small"
          sx={{ flex: 1 }}
          disabled={loading}
          helperText="Path to folder containing sample/dataset/H5 structure"
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Beamline</InputLabel>
          <Select
            value={beamline}
            label="Beamline"
            onChange={(e) => setBeamline(e.target.value)}
            disabled={loading}
          >
            {BEAMLINES.map((bl) => (
              <MenuItem key={bl.value} value={bl.value}>
                {bl.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={18} /> : <FolderOpenIcon />}
          onClick={handleOpen}
          disabled={!projectPath.trim() || loading}
        >
          {loading ? 'Opening...' : 'Open'}
        </Button>
      </Box>
    </Paper>
  );
}
