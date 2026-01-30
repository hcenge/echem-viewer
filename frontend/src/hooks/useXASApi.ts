/**
 * XAS API hook for making requests to the XAS backend endpoints.
 */

import { useState, useCallback } from 'react';
import type {
  XASProjectState,
  ROIConfig,
  NormalizedScan,
  ScanParams,
  AveragedData,
  Reference,
  DerivativeResult,
  PeakFitResult,
  OpenProjectRequest,
  NormalizeRequest,
  SaveScanParamsRequest,
  DerivativeRequest,
  PeakFitRequest,
  SavePeakFitRequest,
  ExportXASRequest,
  DatasetInfo,
  CodeExportRequest,
  CodeExportPreview,
  ReviewProgress,
  BulkApplyParamsRequest,
  H5ChannelInfo,
  DirectViewRequest,
  DirectViewResponse,
} from '../types/xas';

const API_BASE = '/api/xas';

export function useXASApi() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const clearError = useCallback(() => setError(null), []);

  // Generic fetch helper
  const apiFetch = useCallback(async <T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Project management
  const openProject = useCallback(async (request: OpenProjectRequest): Promise<XASProjectState> => {
    return apiFetch<XASProjectState>('/project/open', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }, [apiFetch]);

  const closeProject = useCallback(async (): Promise<{ status: string }> => {
    return apiFetch<{ status: string }>('/project/close', {
      method: 'POST',
    });
  }, [apiFetch]);

  const getProjectInfo = useCallback(async (): Promise<XASProjectState> => {
    return apiFetch<XASProjectState>('/project/info');
  }, [apiFetch]);

  // Navigation
  const getSamples = useCallback(async (): Promise<string[]> => {
    return apiFetch<string[]>('/samples');
  }, [apiFetch]);

  const getDatasets = useCallback(async (sample: string): Promise<DatasetInfo[]> => {
    return apiFetch<DatasetInfo[]>(`/datasets/${encodeURIComponent(sample)}`);
  }, [apiFetch]);

  const getScans = useCallback(async (
    sample: string,
    dataset: string,
    roi?: string
  ): Promise<string[]> => {
    const params = roi ? `?roi=${encodeURIComponent(roi)}` : '';
    return apiFetch<string[]>(`/scans/${encodeURIComponent(sample)}/${encodeURIComponent(dataset)}${params}`);
  }, [apiFetch]);

  // ROI configurations
  const getROIConfigs = useCallback(async (): Promise<ROIConfig[]> => {
    return apiFetch<ROIConfig[]>('/roi-configs');
  }, [apiFetch]);

  const getValidROIsForDataset = useCallback(async (
    sample: string,
    dataset: string
  ): Promise<(ROIConfig & { valid_scan_count: number })[]> => {
    return apiFetch<(ROIConfig & { valid_scan_count: number })[]>(
      `/roi-configs/valid/${encodeURIComponent(sample)}/${encodeURIComponent(dataset)}`
    );
  }, [apiFetch]);

  const saveROIConfig = useCallback(async (config: ROIConfig): Promise<ROIConfig> => {
    return apiFetch<ROIConfig>('/roi-configs', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }, [apiFetch]);

  const deleteROIConfig = useCallback(async (name: string): Promise<{ status: string }> => {
    return apiFetch<{ status: string }>(`/roi-configs/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }, [apiFetch]);

  // H5 Channel Discovery & Direct View
  const getH5Channels = useCallback(async (
    sample: string,
    dataset: string
  ): Promise<H5ChannelInfo> => {
    return apiFetch<H5ChannelInfo>(
      `/h5-channels/${encodeURIComponent(sample)}/${encodeURIComponent(dataset)}`
    );
  }, [apiFetch]);

  const getDirectViewData = useCallback(async (
    request: DirectViewRequest
  ): Promise<DirectViewResponse> => {
    return apiFetch<DirectViewResponse>('/direct-view', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }, [apiFetch]);

  // Normalization
  const normalize = useCallback(async (request: NormalizeRequest): Promise<NormalizedScan> => {
    return apiFetch<NormalizedScan>('/normalize', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }, [apiFetch]);

  // Scan parameters
  const getScanParams = useCallback(async (
    sample: string,
    dataset: string,
    roi: string,
    scanKey: string
  ): Promise<ScanParams | null> => {
    try {
      return await apiFetch<ScanParams>(
        `/scan-params/${encodeURIComponent(sample)}/${encodeURIComponent(dataset)}/${encodeURIComponent(roi)}/${encodeURIComponent(scanKey)}`
      );
    } catch {
      return null;
    }
  }, [apiFetch]);

  const saveScanParams = useCallback(async (request: SaveScanParamsRequest): Promise<ScanParams> => {
    return apiFetch<ScanParams>('/scan-params', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }, [apiFetch]);

  // Averaging
  const getAveragedData = useCallback(async (
    sample: string,
    dataset: string,
    roi: string
  ): Promise<AveragedData> => {
    return apiFetch<AveragedData>(
      `/average/${encodeURIComponent(sample)}/${encodeURIComponent(dataset)}/${encodeURIComponent(roi)}`
    );
  }, [apiFetch]);

  // Bulk operations
  const bulkApplyParams = useCallback(async (request: BulkApplyParamsRequest): Promise<{ success: boolean; updated_count: number }> => {
    return apiFetch<{ success: boolean; updated_count: number }>('/bulk-apply-params', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }, [apiFetch]);

  // References
  const getReferences = useCallback(async (): Promise<Reference[]> => {
    return apiFetch<Reference[]>('/references');
  }, [apiFetch]);

  const saveReference = useCallback(async (reference: Reference): Promise<Reference> => {
    return apiFetch<Reference>('/references', {
      method: 'POST',
      body: JSON.stringify(reference),
    });
  }, [apiFetch]);

  const deleteReference = useCallback(async (name: string): Promise<{ status: string }> => {
    return apiFetch<{ status: string }>(`/references/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }, [apiFetch]);

  // Derivatives
  const calculateDerivative = useCallback(async (request: DerivativeRequest): Promise<DerivativeResult> => {
    return apiFetch<DerivativeResult>('/derivative', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }, [apiFetch]);

  // Peak fitting
  const fitPeaks = useCallback(async (request: PeakFitRequest): Promise<PeakFitResult> => {
    return apiFetch<PeakFitResult>('/peak-fit', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }, [apiFetch]);

  const savePeakFit = useCallback(async (request: SavePeakFitRequest): Promise<{ status: string }> => {
    return apiFetch<{ status: string }>('/peak-fit/save', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }, [apiFetch]);

  // Export
  const exportXAS = useCallback(async (request: ExportXASRequest): Promise<Blob> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/export`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      return await response.blob();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Review progress
  const getReviewProgress = useCallback(async (
    sample: string,
    dataset: string,
    roi: string
  ): Promise<ReviewProgress> => {
    return apiFetch<ReviewProgress>(
      `/review-progress/${encodeURIComponent(sample)}/${encodeURIComponent(dataset)}/${encodeURIComponent(roi)}`
    );
  }, [apiFetch]);

  // Code export - download Python script
  const exportCode = useCallback(async (request: CodeExportRequest): Promise<Blob> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/export/code`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      return await response.blob();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Code export preview - get code as string for display
  const previewCode = useCallback(async (request: CodeExportRequest): Promise<CodeExportPreview> => {
    return apiFetch<CodeExportPreview>('/export/code-preview', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }, [apiFetch]);

  return {
    // State
    error,
    loading,
    clearError,

    // Project
    openProject,
    closeProject,
    getProjectInfo,

    // Navigation
    getSamples,
    getDatasets,
    getScans,

    // ROI configs
    getROIConfigs,
    getValidROIsForDataset,
    saveROIConfig,
    deleteROIConfig,

    // H5 Channels & Direct View
    getH5Channels,
    getDirectViewData,

    // Normalization
    normalize,

    // Scan params
    getScanParams,
    saveScanParams,

    // Averaging
    getAveragedData,

    // Bulk operations
    bulkApplyParams,

    // References
    getReferences,
    saveReference,
    deleteReference,

    // Derivatives
    calculateDerivative,

    // Peak fitting
    fitPeaks,
    savePeakFit,

    // Export
    exportXAS,
    exportCode,
    previewCode,

    // Progress
    getReviewProgress,
  };
}
