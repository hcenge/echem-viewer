/**
 * XAS Context - Global state management for XAS processing workflow.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useXASApi } from '../hooks/useXASApi';
import type {
  XASProjectState,
  ROIConfig,
  NormalizedScan,
  ScanParams,
  Reference,
  DatasetInfo,
  NormParams,
  ScanStatus,
  AveragedData,
} from '../types/xas';

// Default normalization parameters
const DEFAULT_NORM_PARAMS: NormParams = {
  pre1: -150,
  pre2: -30,
  norm1: 50,
  norm2: 400,
  e0: null,
  step: null,
};

interface XASContextState {
  // Project state
  project: XASProjectState | null;
  isProjectOpen: boolean;

  // Navigation
  selectedSample: string | null;
  selectedDataset: string | null;
  selectedROI: string | null;
  selectedScan: string | null;

  // Data
  samples: string[];
  datasets: DatasetInfo[];
  scans: string[];
  roiConfigs: ROIConfig[];
  validROIs: (ROIConfig & { valid_scan_count?: number })[];  // ROIs with data for current dataset
  references: Reference[];

  // Current scan data
  currentScanData: NormalizedScan | null;
  currentScanParams: ScanParams | null;
  normParams: NormParams;
  energyShift: number;

  // Averaged data
  averagedData: AveragedData | null;
  averagingLoading: boolean;

  // Loading/error state
  loading: boolean;
  error: string | null;

  // Actions
  openProject: (projectPath: string, beamline?: string) => Promise<void>;
  closeProject: () => Promise<void>;
  selectSample: (sample: string | null) => void;
  selectDataset: (dataset: string | null) => void;
  selectROI: (roi: string | null) => void;
  selectScan: (scan: string | null) => void;
  setNormParams: (params: Partial<NormParams>) => void;
  setEnergyShift: (shift: number) => void;
  normalizeCurrentScan: () => Promise<void>;
  saveScanParams: (status: ScanStatus) => Promise<void>;
  refreshScans: () => Promise<void>;
  refreshReferences: () => Promise<void>;
  saveROIConfig: (config: ROIConfig) => Promise<void>;
  deleteROIConfig: (name: string) => Promise<void>;
  saveReference: (ref: Reference) => Promise<void>;
  deleteReference: (name: string) => Promise<void>;
  clearError: () => void;

  // Averaging
  fetchAveragedData: () => Promise<void>;

  // Bulk operations
  applyParamsToAllScans: (status?: ScanStatus) => Promise<void>;

  // Navigation helpers
  goToNextScan: () => void;
  goToPrevScan: () => void;
}

const XASContext = createContext<XASContextState | null>(null);

export function XASProvider({ children }: { children: ReactNode }) {
  const {
    error: apiError,
    loading: apiLoading,
    clearError: apiClearError,
    openProject: apiOpenProject,
    closeProject: apiCloseProject,
    getDatasets: apiGetDatasets,
    getScans: apiGetScans,
    getROIConfigs: apiGetROIConfigs,
    getReferences: apiGetReferences,
    getScanParams: apiGetScanParams,
    saveScanParams: apiSaveScanParams,
    normalize: apiNormalize,
    saveROIConfig: apiSaveROIConfig,
    deleteROIConfig: apiDeleteROIConfig,
    saveReference: apiSaveReference,
    deleteReference: apiDeleteReference,
    getAveragedData: apiGetAveragedData,
    bulkApplyParams: apiBulkApplyParams,
    getValidROIsForDataset: apiGetValidROIsForDataset,
  } = useXASApi();

  // Project state
  const [project, setProject] = useState<XASProjectState | null>(null);

  // Navigation state
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [selectedROI, setSelectedROI] = useState<string | null>(null);
  const [selectedScan, setSelectedScan] = useState<string | null>(null);

  // Data state
  const [samples, setSamples] = useState<string[]>([]);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [scans, setScans] = useState<string[]>([]);
  const [roiConfigs, setROIConfigs] = useState<ROIConfig[]>([]);
  const [validROIs, setValidROIs] = useState<(ROIConfig & { valid_scan_count?: number })[]>([]);
  const [references, setReferences] = useState<Reference[]>([]);

  // Current scan state
  const [currentScanData, setCurrentScanData] = useState<NormalizedScan | null>(null);
  const [currentScanParams, setCurrentScanParams] = useState<ScanParams | null>(null);
  const [normParams, setNormParamsState] = useState<NormParams>(DEFAULT_NORM_PARAMS);
  const [energyShift, setEnergyShiftState] = useState(0);

  // Averaged data state
  const [averagedData, setAveragedData] = useState<AveragedData | null>(null);
  const [averagingLoading, setAveragingLoading] = useState(false);

  // Derived state
  const isProjectOpen = project?.is_open ?? false;

  // Open project
  const openProject = useCallback(async (projectPath: string, beamline: string = 'BM23') => {
    try {
      const state = await apiOpenProject({ project_path: projectPath, beamline });
      setProject(state);
      setSamples(state.samples);
      setSelectedSample(null);
      setSelectedDataset(null);
      setSelectedROI(null);
      setSelectedScan(null);
      setDatasets([]);
      setScans([]);
      setCurrentScanData(null);
      setCurrentScanParams(null);

      // Load ROI configs and references
      const [configs, refs] = await Promise.all([
        apiGetROIConfigs(),
        apiGetReferences(),
      ]);
      setROIConfigs(configs);
      setReferences(refs);

      // Auto-select first ROI if available
      if (configs.length > 0) {
        setSelectedROI(configs[0].name);
      }
    } catch {
      // Error handled by api hook
    }
  }, [apiOpenProject, apiGetROIConfigs, apiGetReferences]);

  // Close project
  const closeProject = useCallback(async () => {
    try {
      await apiCloseProject();
      setProject(null);
      setSamples([]);
      setDatasets([]);
      setScans([]);
      setROIConfigs([]);
      setReferences([]);
      setSelectedSample(null);
      setSelectedDataset(null);
      setSelectedROI(null);
      setSelectedScan(null);
      setCurrentScanData(null);
      setCurrentScanParams(null);
    } catch {
      // Error handled by api hook
    }
  }, [apiCloseProject]);

  // Load datasets when sample changes
  useEffect(() => {
    if (!selectedSample || !isProjectOpen) {
      setDatasets([]);
      return;
    }

    apiGetDatasets(selectedSample)
      .then(setDatasets)
      .catch(() => setDatasets([]));
  }, [selectedSample, isProjectOpen, apiGetDatasets]);

  // Load valid ROIs when dataset changes
  useEffect(() => {
    if (!selectedSample || !selectedDataset || !isProjectOpen) {
      setValidROIs(roiConfigs);  // Fall back to all configs
      return;
    }

    apiGetValidROIsForDataset(selectedSample, selectedDataset)
      .then((valid) => {
        setValidROIs(valid);
        // Auto-select first valid ROI if current selection is not valid
        if (selectedROI && !valid.some(r => r.name === selectedROI)) {
          setSelectedROI(valid.length > 0 ? valid[0].name : null);
        } else if (!selectedROI && valid.length > 0) {
          setSelectedROI(valid[0].name);
        }
      })
      .catch(() => setValidROIs(roiConfigs));
  }, [selectedSample, selectedDataset, isProjectOpen, roiConfigs, selectedROI, apiGetValidROIsForDataset]);

  // Load scans when dataset/ROI changes
  const refreshScans = useCallback(async () => {
    if (!selectedSample || !selectedDataset || !isProjectOpen) {
      setScans([]);
      return;
    }

    try {
      const scanList = await apiGetScans(selectedSample, selectedDataset, selectedROI || undefined);
      setScans(scanList);
    } catch {
      setScans([]);
    }
  }, [selectedSample, selectedDataset, selectedROI, isProjectOpen, apiGetScans]);

  useEffect(() => {
    refreshScans();
  }, [refreshScans]);

  // Load saved params when scan selection changes
  useEffect(() => {
    if (!selectedSample || !selectedDataset || !selectedROI || !selectedScan || !isProjectOpen) {
      setCurrentScanData(null);
      setCurrentScanParams(null);
      return;
    }

    // Load saved params if they exist
    apiGetScanParams(selectedSample, selectedDataset, selectedROI, selectedScan)
      .then(params => {
        // Check if params exists and has content (not empty object)
        if (params && Object.keys(params).length > 0) {
          setCurrentScanParams(params);
          // Use saved params if available, otherwise fall back to defaults
          setNormParamsState(params.norm_params ?? DEFAULT_NORM_PARAMS);
          setEnergyShiftState(params.energy_shift ?? 0);
        } else {
          setCurrentScanParams(null);
          setNormParamsState(DEFAULT_NORM_PARAMS);
          setEnergyShiftState(0);
        }
      });
  }, [selectedSample, selectedDataset, selectedROI, selectedScan, isProjectOpen, apiGetScanParams]);

  // Normalize scan when params change (separate from loading saved params)
  useEffect(() => {
    if (!selectedSample || !selectedDataset || !selectedROI || !selectedScan || !isProjectOpen) {
      return;
    }

    // Get ROI config
    const roiConfig = roiConfigs.find(r => r.name === selectedROI);
    if (!roiConfig) return;

    // Normalize the scan with current params
    apiNormalize({
      sample: selectedSample,
      dataset: selectedDataset,
      scan: selectedScan,
      roi: selectedROI,
      ...normParams,
      energy_shift: energyShift,
    })
      .then(setCurrentScanData)
      .catch(() => setCurrentScanData(null));
  }, [selectedSample, selectedDataset, selectedROI, selectedScan, roiConfigs, isProjectOpen, apiNormalize, normParams, energyShift]);

  // Normalize current scan with current params
  const normalizeCurrentScan = useCallback(async () => {
    if (!selectedSample || !selectedDataset || !selectedROI || !selectedScan) return;

    try {
      const data = await apiNormalize({
        sample: selectedSample,
        dataset: selectedDataset,
        scan: selectedScan,
        roi: selectedROI,
        ...normParams,
        energy_shift: energyShift,
      });
      setCurrentScanData(data);
    } catch {
      // Error handled by api hook
    }
  }, [selectedSample, selectedDataset, selectedROI, selectedScan, normParams, energyShift, apiNormalize]);

  // Save scan parameters
  const saveScanParamsAction = useCallback(async (status: ScanStatus) => {
    if (!selectedSample || !selectedDataset || !selectedROI || !selectedScan) return;

    // Get reference name if energy shift is set
    const referenceName = energyShift !== 0
      ? references.find(r => r.e0)?.name
      : undefined;

    try {
      const params = await apiSaveScanParams({
        sample: selectedSample,
        dataset: selectedDataset,
        roi: selectedROI,
        scan: selectedScan,
        status,
        ...normParams,
        energy_shift: energyShift,
        reference_name: referenceName,
      });
      setCurrentScanParams(params);
    } catch {
      // Error handled by api hook
    }
  }, [selectedSample, selectedDataset, selectedROI, selectedScan, normParams, energyShift, references, apiSaveScanParams]);

  // Navigation helpers
  const selectSample = useCallback((sample: string | null) => {
    setSelectedSample(sample);
    setSelectedDataset(null);
    setSelectedScan(null);
  }, []);

  const selectDataset = useCallback((dataset: string | null) => {
    setSelectedDataset(dataset);
    setSelectedScan(null);
  }, []);

  const selectROI = useCallback((roi: string | null) => {
    setSelectedROI(roi);
    setSelectedScan(null);
  }, []);

  const selectScan = useCallback((scan: string | null) => {
    setSelectedScan(scan);
  }, []);

  const goToNextScan = useCallback(() => {
    if (!selectedScan || scans.length === 0) return;
    const currentIndex = scans.indexOf(selectedScan);
    if (currentIndex < scans.length - 1) {
      setSelectedScan(scans[currentIndex + 1]);
    }
  }, [selectedScan, scans]);

  const goToPrevScan = useCallback(() => {
    if (!selectedScan || scans.length === 0) return;
    const currentIndex = scans.indexOf(selectedScan);
    if (currentIndex > 0) {
      setSelectedScan(scans[currentIndex - 1]);
    }
  }, [selectedScan, scans]);

  // Set norm params
  const setNormParams = useCallback((params: Partial<NormParams>) => {
    setNormParamsState(prev => ({ ...prev, ...params }));
  }, []);

  const setEnergyShift = useCallback((shift: number) => {
    setEnergyShiftState(shift);
  }, []);

  // Refresh references
  const refreshReferences = useCallback(async () => {
    try {
      const refs = await apiGetReferences();
      setReferences(refs);
    } catch {
      // Error handled by api hook
    }
  }, [apiGetReferences]);

  // ROI config actions
  const saveROIConfigAction = useCallback(async (config: ROIConfig) => {
    try {
      await apiSaveROIConfig(config);
      const configs = await apiGetROIConfigs();
      setROIConfigs(configs);
    } catch {
      // Error handled by api hook
    }
  }, [apiSaveROIConfig, apiGetROIConfigs]);

  const deleteROIConfigAction = useCallback(async (name: string) => {
    try {
      await apiDeleteROIConfig(name);
      const configs = await apiGetROIConfigs();
      setROIConfigs(configs);
      if (selectedROI === name) {
        setSelectedROI(configs.length > 0 ? configs[0].name : null);
      }
    } catch {
      // Error handled by api hook
    }
  }, [apiDeleteROIConfig, apiGetROIConfigs, selectedROI]);

  // Reference actions
  const saveReferenceAction = useCallback(async (ref: Reference) => {
    try {
      await apiSaveReference(ref);
      await refreshReferences();
    } catch {
      // Error handled by api hook
    }
  }, [apiSaveReference, refreshReferences]);

  const deleteReferenceAction = useCallback(async (name: string) => {
    try {
      await apiDeleteReference(name);
      await refreshReferences();
    } catch {
      // Error handled by api hook
    }
  }, [apiDeleteReference, refreshReferences]);

  // Fetch averaged data for current dataset/ROI
  const fetchAveragedData = useCallback(async () => {
    if (!selectedSample || !selectedDataset || !selectedROI) {
      setAveragedData(null);
      return;
    }

    setAveragingLoading(true);
    try {
      const data = await apiGetAveragedData(selectedSample, selectedDataset, selectedROI);
      // Check if it's an error response
      if ('error' in data) {
        setAveragedData(null);
      } else {
        setAveragedData(data);
      }
    } catch {
      setAveragedData(null);
    } finally {
      setAveragingLoading(false);
    }
  }, [selectedSample, selectedDataset, selectedROI, apiGetAveragedData]);

  // Apply current normalization params to all scans
  const applyParamsToAllScans = useCallback(async (status?: ScanStatus) => {
    if (!selectedSample || !selectedDataset || !selectedROI || scans.length === 0) return;

    try {
      await apiBulkApplyParams({
        sample: selectedSample,
        dataset: selectedDataset,
        roi: selectedROI,
        scans: scans,
        pre1: normParams.pre1,
        pre2: normParams.pre2,
        norm1: normParams.norm1,
        norm2: normParams.norm2,
        status: status,
        energy_shift: energyShift,
      });
      // Refresh the scans to update UI
      await refreshScans();
    } catch {
      // Error handled by api hook
    }
  }, [selectedSample, selectedDataset, selectedROI, scans, normParams, energyShift, apiBulkApplyParams, refreshScans]);

  const value: XASContextState = {
    // State
    project,
    isProjectOpen,
    selectedSample,
    selectedDataset,
    selectedROI,
    selectedScan,
    samples,
    datasets,
    scans,
    roiConfigs,
    validROIs,
    references,
    currentScanData,
    currentScanParams,
    normParams,
    energyShift,
    averagedData,
    averagingLoading,
    loading: apiLoading,
    error: apiError,

    // Actions
    openProject,
    closeProject,
    selectSample,
    selectDataset,
    selectROI,
    selectScan,
    setNormParams,
    setEnergyShift,
    normalizeCurrentScan,
    saveScanParams: saveScanParamsAction,
    refreshScans,
    refreshReferences,
    saveROIConfig: saveROIConfigAction,
    deleteROIConfig: deleteROIConfigAction,
    saveReference: saveReferenceAction,
    deleteReference: deleteReferenceAction,
    clearError: apiClearError,
    fetchAveragedData,
    applyParamsToAllScans,
    goToNextScan,
    goToPrevScan,
  };

  return (
    <XASContext.Provider value={value}>
      {children}
    </XASContext.Provider>
  );
}

export function useXAS() {
  const context = useContext(XASContext);
  if (!context) {
    throw new Error('useXAS must be used within XASProvider');
  }
  return context;
}
