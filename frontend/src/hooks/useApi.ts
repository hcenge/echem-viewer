/**
 * API client hook for communicating with FastAPI backend
 */

import { useState, useCallback } from 'react';
import type {
  FileInfo,
  MetadataUpdate,
  DataRequest,
  DataResponse,
  ExportRequest,
  TechniquesResponse,
  SessionStats,
  UploadResponse,
} from '../types/api';

// Use relative URL in production, localhost in development
const API_BASE = import.meta.env.DEV ? 'http://localhost:8000' : '';

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Upload files
  const uploadFiles = useCallback(async (files: File[]): Promise<UploadResponse> => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Upload failed');
      }

      return await response.json();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // List files
  const listFiles = useCallback(async (): Promise<FileInfo[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/files`);
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      return await response.json();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch files';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete file
  const deleteFile = useCallback(async (filename: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/files/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete file');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete file';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update metadata
  const updateMetadata = useCallback(async (filename: string, updates: MetadataUpdate): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/files/${encodeURIComponent(filename)}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        throw new Error('Failed to update metadata');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update metadata';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get data for chart
  const getData = useCallback(async (filename: string, request: DataRequest): Promise<DataResponse> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/data/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      return await response.json();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch data';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get techniques
  const getTechniques = useCallback(async (): Promise<TechniquesResponse> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/techniques`);
      if (!response.ok) {
        throw new Error('Failed to fetch techniques');
      }
      return await response.json();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch techniques';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // Export
  const exportSession = useCallback(async (request: ExportRequest): Promise<Blob> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        throw new Error('Failed to export');
      }
      return await response.blob();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to export';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get session stats
  const getStats = useCallback(async (): Promise<SessionStats> => {
    const response = await fetch(`${API_BASE}/stats`);
    if (!response.ok) {
      throw new Error('Failed to fetch stats');
    }
    return await response.json();
  }, []);

  return {
    loading,
    error,
    clearError,
    uploadFiles,
    listFiles,
    deleteFile,
    updateMetadata,
    getData,
    getTechniques,
    exportSession,
    getStats,
  };
}
