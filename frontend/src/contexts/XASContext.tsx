/**
 * XAS Context - Global state management for XAS processing workflow.
 */

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
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
  H5ChannelInfo,
  DirectViewSettings,
  DirectViewResponse,
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

/** Active view settings - computed from either direct view or ROI selection */
interface ActiveViewSettings {
  xExpr: string;
  yExpr: string;
  energyMin?: number | null;
  energyMax?: number | null;
  fromROI: boolean;
}

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

  // H5 Channel Discovery & Direct View
  h5Channels: H5ChannelInfo | null;
  directViewSettings: DirectViewSettings | null;
  directViewData: DirectViewResponse | null;
  directViewLoading: boolean;
  isDirectViewMode: boolean;
  activeViewSettings: ActiveViewSettings | null;

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

  // H5 Channels & Direct View
  setDirectViewSettings: (settings: DirectViewSettings | null) => void;
  fetchDirectViewData: () => Promise<void>;
  saveCurrentAsROI: (name: string, element?: string, energyMin?: number | null, energyMax?: number | null) => Promise<void>;

  // Averaging
  fetchAveragedData: () => Promise<void>;

  // Bulk operations
  applyParamsToAllScans: (status?: ScanStatus) => Promise<void>;

  // Navigation helpers
  goToNextScan: () => void;
  goToPrevScan: () => void;
  goToNextSample: () => void;
  goToPrevSample: () => void;
  goToNextDataset: () => void;
  goToPrevDataset: () => void;
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
    getH5Channels: apiGetH5Channels,
    getDirectViewData: apiGetDirectViewData,
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

  // H5 Channels & Direct View state
  const [h5Channels, setH5Channels] = useState<H5ChannelInfo | null>(null);
  const [directViewSettings, setDirectViewSettingsState] = useState<DirectViewSettings | null>(null);
  const [directViewData, setDirectViewData] = useState<DirectViewResponse | null>(null);
  const [directViewLoading, setDirectViewLoading] = useState(false);

  // Derived state
  const isProjectOpen = project?.is_open ?? false;

  // Whether we're using direct view or ROI mode
  const isDirectViewMode = !selectedROI || selectedROI === '';

  // Active view settings (ROI overrides direct view)
  const activeViewSettings = useMemo((): ActiveViewSettings | null => {
    if (selectedROI && roiConfigs.length > 0) {
      const roi = roiConfigs.find(r => r.name === selectedROI);
      if (roi) {
        // Build expression from ROI config (use full path if parent_path specified)
        const prefix = roi.parent_path ? `${roi.parent_path}__` : '';
        const yExpr = roi.denominator
          ? `${prefix}${roi.numerator} / ${prefix}${roi.denominator}`
          : `${prefix}${roi.numerator}`;
        return {
          xExpr: `${prefix}energy_enc`,  // ROIs always use energy as X
          yExpr,
          energyMin: roi.energy_min,
          energyMax: roi.energy_max,
          fromROI: true,
        };
      }
    }
    if (directViewSettings) {
      return { ...directViewSettings, fromROI: false };
    }
    return null;
  }, [selectedROI, roiConfigs, directViewSettings]);

  // Open project
  const openProject = useCallback(async (projectPath: string, beamline: string = 'BM23') => {
    try {
      const state = await apiOpenProject({ project_path: projectPath, beamline });
      setProject(state);
      setSamples(state.samples);
      // Auto-select first sample if available
      setSelectedSample(state.samples.length > 0 ? state.samples[0] : null);
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
      // Start in Direct View Mode (no ROI selected by default)
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

  // Auto-select first dataset when datasets change
  useEffect(() => {
    setSelectedDataset(prev => {
      if (datasets.length > 0 && (!prev || !datasets.some(d => d.dataset === prev))) {
        return datasets[0].dataset;
      } else if (datasets.length === 0 && prev) {
        return null;
      }
      return prev;
    });
  }, [datasets]);

  // Load H5 channels when dataset changes
  useEffect(() => {
    if (!selectedSample || !selectedDataset || !isProjectOpen) {
      setH5Channels(null);
      setDirectViewSettingsState(null);
      return;
    }

    apiGetH5Channels(selectedSample, selectedDataset)
      .then(channels => {
        setH5Channels(channels);
        // Auto-select common defaults - find energy and I0 channels
        // Use full paths (parent__channel) for clarity
        let defaultX = '';
        let defaultY = '';
        let defaultXParent = '';
        let defaultYParent = '';
        for (const parent of channels.parent_paths) {
          const parentChannels = channels.channels[parent] || [];
          if (!defaultX) {
            const energyCh = parentChannels.find(c => c.includes('energy'));
            if (energyCh) {
              defaultX = energyCh;
              defaultXParent = parent;
            }
          }
          if (!defaultY) {
            const i0Ch = parentChannels.find(c => c === 'I0' || c.includes('I0'));
            if (i0Ch) {
              defaultY = i0Ch;
              defaultYParent = parent;
            }
          }
        }
        // Fallback to first available channels
        if (!defaultX && channels.parent_paths.length > 0) {
          const firstParent = channels.parent_paths[0];
          const first = channels.channels[firstParent];
          if (first?.length > 0) {
            defaultX = first[0];
            defaultXParent = firstParent;
          }
        }
        if (!defaultY && channels.parent_paths.length > 0) {
          const firstParent = channels.parent_paths[0];
          const first = channels.channels[firstParent];
          if (first?.length > 1) {
            defaultY = first[1];
            defaultYParent = firstParent;
          } else if (first?.length > 0) {
            defaultY = first[0];
            defaultYParent = firstParent;
          }
        }
        // Build full path expressions (parent__channel)
        const xExpr = defaultX && defaultXParent ? `${defaultXParent}__${defaultX}` : '';
        const yExpr = defaultY && defaultYParent ? `${defaultYParent}__${defaultY}` : '';
        setDirectViewSettingsState({
          xExpr,
          yExpr,
        });
      })
      .catch(() => {
        setH5Channels(null);
        setDirectViewSettingsState(null);
      });
  }, [selectedSample, selectedDataset, isProjectOpen, apiGetH5Channels]);

  // Load valid ROIs when dataset changes
  useEffect(() => {
    if (!selectedSample || !selectedDataset || !isProjectOpen) {
      setValidROIs(roiConfigs);  // Fall back to all configs
      return;
    }

    apiGetValidROIsForDataset(selectedSample, selectedDataset)
      .then((valid) => {
        setValidROIs(valid);
        // Only reset ROI if current selection is invalid (not in the valid list)
        // Don't auto-select first ROI - allow Direct View Mode (null ROI)
        if (selectedROI && !valid.some(r => r.name === selectedROI)) {
          setSelectedROI(null);  // Reset to Direct View Mode if current ROI is invalid
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

  // Auto-select first scan when scans change and no valid selection
  useEffect(() => {
    setSelectedScan(prev => {
      if (scans.length > 0 && (!prev || !scans.includes(prev))) {
        return scans[0];
      } else if (scans.length === 0 && prev) {
        return null;
      }
      return prev;
    });
  }, [scans]);

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
  // Only runs when we have an ROI selected (not in direct view mode)
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

  // Fetch direct view data when settings or scan changes (only in direct view mode)
  useEffect(() => {
    if (!isDirectViewMode || !selectedSample || !selectedDataset || !selectedScan || !directViewSettings) {
      setDirectViewData(null);
      return;
    }

    // Only fetch if we have valid expressions
    if (!directViewSettings.xExpr || !directViewSettings.yExpr) {
      setDirectViewData(null);
      return;
    }

    setDirectViewLoading(true);
    apiGetDirectViewData({
      sample: selectedSample,
      dataset: selectedDataset,
      scan: selectedScan,
      x_expr: directViewSettings.xExpr,
      y_expr: directViewSettings.yExpr,
    })
      .then(setDirectViewData)
      .catch(() => setDirectViewData(null))
      .finally(() => setDirectViewLoading(false));
  }, [isDirectViewMode, selectedSample, selectedDataset, selectedScan, directViewSettings, apiGetDirectViewData]);

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

  // Sample navigation
  const goToNextSample = useCallback(() => {
    if (!selectedSample || samples.length === 0) return;
    const currentIndex = samples.indexOf(selectedSample);
    if (currentIndex < samples.length - 1) {
      setSelectedSample(samples[currentIndex + 1]);
    }
  }, [selectedSample, samples]);

  const goToPrevSample = useCallback(() => {
    if (!selectedSample || samples.length === 0) return;
    const currentIndex = samples.indexOf(selectedSample);
    if (currentIndex > 0) {
      setSelectedSample(samples[currentIndex - 1]);
    }
  }, [selectedSample, samples]);

  // Dataset navigation
  const goToNextDataset = useCallback(() => {
    if (!selectedDataset || datasets.length === 0) return;
    const currentIndex = datasets.findIndex(d => d.dataset === selectedDataset);
    if (currentIndex < datasets.length - 1) {
      setSelectedDataset(datasets[currentIndex + 1].dataset);
    }
  }, [selectedDataset, datasets]);

  const goToPrevDataset = useCallback(() => {
    if (!selectedDataset || datasets.length === 0) return;
    const currentIndex = datasets.findIndex(d => d.dataset === selectedDataset);
    if (currentIndex > 0) {
      setSelectedDataset(datasets[currentIndex - 1].dataset);
    }
  }, [selectedDataset, datasets]);

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

  // Set direct view settings
  const setDirectViewSettings = useCallback((settings: DirectViewSettings | null) => {
    setDirectViewSettingsState(settings);
  }, []);

  // Fetch direct view data (expression-based channel data without normalization)
  const fetchDirectViewData = useCallback(async () => {
    if (!selectedSample || !selectedDataset || !selectedScan || !directViewSettings) {
      setDirectViewData(null);
      return;
    }

    setDirectViewLoading(true);
    try {
      const data = await apiGetDirectViewData({
        sample: selectedSample,
        dataset: selectedDataset,
        scan: selectedScan,
        x_expr: directViewSettings.xExpr,
        y_expr: directViewSettings.yExpr,
      });
      setDirectViewData(data);
    } catch {
      setDirectViewData(null);
    } finally {
      setDirectViewLoading(false);
    }
  }, [selectedSample, selectedDataset, selectedScan, directViewSettings, apiGetDirectViewData]);

  // Save current direct view settings as a new ROI config
  // Extracts numerator/denominator from the Y expression if it's a simple "a / b" pattern
  const saveCurrentAsROI = useCallback(async (
    name: string,
    element?: string,
    energyMin?: number | null,
    energyMax?: number | null,
  ) => {
    if (!directViewSettings) return;

    // Parse Y expression to extract numerator/denominator
    // Supports: "channel" or "channel / denominator" (with optional parent__ prefix)
    const yMatch = directViewSettings.yExpr.match(/^\s*((?:\w+__)?\w+)\s*(?:\/\s*((?:\w+__)?\w+))?\s*$/);
    const numerator = yMatch?.[1] || directViewSettings.yExpr;
    const denominator = yMatch?.[2] || null;

    // Extract parent_path from numerator if it has __ prefix
    let parent_path = 'instrument';
    let cleanNumerator = numerator;
    let cleanDenominator = denominator;
    if (numerator.includes('__')) {
      const parts = numerator.split('__');
      parent_path = parts[0];
      cleanNumerator = parts.slice(1).join('__');
    }
    if (denominator?.includes('__')) {
      cleanDenominator = denominator.split('__').slice(1).join('__');
    }

    const newConfig: ROIConfig = {
      name,
      element: element || undefined,
      parent_path,
      numerator: cleanNumerator,
      denominator: cleanDenominator,
      invert_y: false,
      energy_min: energyMin ?? null,
      energy_max: energyMax ?? null,
    };

    try {
      await apiSaveROIConfig(newConfig);
      const configs = await apiGetROIConfigs();
      setROIConfigs(configs);
      // Select the newly created ROI
      setSelectedROI(name);
    } catch {
      // Error handled by api hook
    }
  }, [directViewSettings, apiSaveROIConfig, apiGetROIConfigs]);

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

    // H5 Channels & Direct View state
    h5Channels,
    directViewSettings,
    directViewData,
    directViewLoading,
    isDirectViewMode,
    activeViewSettings,

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
    goToNextSample,
    goToPrevSample,
    goToNextDataset,
    goToPrevDataset,

    // H5 Channels & Direct View actions
    setDirectViewSettings,
    fetchDirectViewData,
    saveCurrentAsROI,
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
