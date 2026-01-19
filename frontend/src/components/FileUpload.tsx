import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import {
  Box,
  Typography,
  LinearProgress,
  Alert,
  Paper,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

interface FileUploadProps {
  onUpload: (files: File[]) => Promise<void>;
  compact?: boolean;
}

const ACCEPTED_EXTENSIONS = ['.mpr', '.dta', '.zip'];

export function FileUpload({ onUpload, compact = false }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setError(null);

      // Check for rejected files
      if (rejectedFiles.length > 0) {
        const names = rejectedFiles.map((r) => r.file.name).join(', ');
        setError(`Invalid file type: ${names}. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`);
        return;
      }

      if (acceptedFiles.length === 0) return;

      setUploading(true);
      setProgress(0);

      // Simulate progress (actual upload doesn't give progress events easily)
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      try {
        await onUpload(acceptedFiles);
        setProgress(100);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        clearInterval(progressInterval);
        setUploading(false);
        setTimeout(() => setProgress(0), 500);
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/octet-stream': ACCEPTED_EXTENSIONS,
      'application/zip': ['.zip'],
    },
    disabled: uploading,
  });

  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Paper
          {...getRootProps()}
          sx={{
            px: 2,
            py: 1,
            border: '1px dashed',
            borderColor: isDragActive ? 'primary.main' : 'grey.400',
            backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
            cursor: uploading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            '&:hover': {
              borderColor: uploading ? 'grey.400' : 'primary.main',
              backgroundColor: uploading ? 'background.paper' : 'action.hover',
            },
          }}
        >
          <input {...getInputProps()} />
          <CloudUploadIcon sx={{ fontSize: 20, color: 'grey.600' }} />
          <Typography variant="body2" color="text.secondary">
            {isDragActive ? 'Drop files...' : uploading ? 'Uploading...' : 'Upload .mpr/.dta/.zip'}
          </Typography>
        </Paper>
        {uploading && <LinearProgress sx={{ width: 100 }} variant="determinate" value={progress} />}
        {error && (
          <Alert severity="error" sx={{ py: 0, px: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Paper
        {...getRootProps()}
        sx={{
          p: 3,
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'grey.400',
          backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: uploading ? 'grey.400' : 'primary.main',
            backgroundColor: uploading ? 'background.paper' : 'action.hover',
          },
        }}
      >
        <input {...getInputProps()} />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 48, color: 'grey.500' }} />
          {isDragActive ? (
            <Typography>Drop files here...</Typography>
          ) : (
            <>
              <Typography>
                Drag & drop files here, or click to select
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Accepted: .mpr, .dta, .zip (session import)
              </Typography>
            </>
          )}
        </Box>
      </Paper>

      {uploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={progress} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Uploading... {progress}%
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
