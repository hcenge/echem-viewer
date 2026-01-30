/**
 * XAS (X-ray Absorption Spectroscopy) types
 */

/** ROI configuration for XAS processing */
export interface ROIConfig {
  name: string;
  numerator: string;
  denominator: string | null;
  description?: string;
}

/** Normalization parameters for a scan */
export interface NormParams {
  pre1: number;
  pre2: number;
  norm1: number;
  norm2: number;
  e0: number | null;
  step: number | null;
}

/** Scan status */
export type ScanStatus = 'unreviewed' | 'good' | 'ignore';

/** Scan parameters saved in database */
export interface ScanParams {
  sample: string;
  dataset: string;
  roi: string;
  scan: string;
  status: ScanStatus;
  norm_params: NormParams;
  energy_shift?: number;
  reference_name?: string;
}

/** Result of normalization */
export interface NormalizedScan {
  energy_eV: number[];
  mu_raw: number[];
  mu_norm: number[];
  mu_pre: number[];
  mu_post: number[];
  e0: number;
  edge_step: number;
  pre_slope: number;
  pre_offset: number;
}

/** Reference spectrum */
export interface Reference {
  name: string;
  description?: string;
  energy_eV: number[];
  mu_norm: number[];
  e0: number;
}

/** Dataset info from H5 scanning */
export interface DatasetInfo {
  dataset: string;
  h5_files: string[];
  scans_total: number;
  scans_reviewed: number;
  scans_good: number;
}

/** Peak fit parameters for a single peak */
export interface PeakParams {
  A: number;
  x0: number;
  gamma: number;
}

/** Result of Lorentzian peak fitting */
export interface PeakFitResult {
  success: boolean;
  n_peaks: number;
  params: Record<string, PeakParams>;
  energy_fit: number[] | null;
  fit_curve: number[] | null;
  r_squared: number | null;
  error: string | null;
}

/** Averaged data for a dataset/ROI */
export interface AveragedData {
  energy: number[];
  norm: number[];
  std: number[];
  e0: number;
  n_scans: number;
  scan_list: string[];
  mean_std: number;
  contributions: ScanContribution[];
}

/** Scan contribution to variance */
export interface ScanContribution {
  scan_key: string;
  mean_std_without: number;
  improvement: number;  // positive means removing this scan would reduce std
}

/** Bulk apply params request */
export interface BulkApplyParamsRequest {
  sample: string;
  dataset: string;
  roi: string;
  scans: string[];
  pre1?: number;
  pre2?: number;
  norm1?: number;
  norm2?: number;
  status?: ScanStatus;
  energy_shift?: number;
}

/** Derivative data */
export interface DerivativeResult {
  energy_eV: number[];
  derivative: number[];
  order: 1 | 2;
  smooth_sigma: number;
}

/** Project state */
export interface XASProjectState {
  project_path: string | null;
  db_path: string | null;
  is_open: boolean;
  beamline: string;
  samples: string[];
  datasets: Record<string, DatasetInfo[]>;
}

/** Beamline H5 path configuration */
export interface BeamlineConfig {
  h5_paths: Record<string, string>;
  parent_path: string;
}

/** Export manifest entry */
export interface ExportManifest {
  sample: string;
  dataset: string;
  roi: string;
  normalization: NormParams;
  reference?: {
    name: string;
    energy_shift: number;
  };
  scans_averaged: string[];
  n_scans: number;
  e0: number;
  peak_fit?: {
    n_peaks: number;
    params: Record<string, PeakParams>;
    r_squared: number;
  };
  exported_at: string;
}

// API request/response types

export interface OpenProjectRequest {
  project_path: string;
  beamline?: string;
}

export interface NormalizeRequest {
  sample: string;
  dataset: string;
  scan: string;
  roi: string;
  pre1?: number;
  pre2?: number;
  norm1?: number;
  norm2?: number;
  energy_shift?: number;
}

export interface SaveScanParamsRequest {
  sample: string;
  dataset: string;
  roi: string;
  scan: string;
  status: ScanStatus;
  pre1?: number;
  pre2?: number;
  norm1?: number;
  norm2?: number;
  energy_shift?: number;
  reference_name?: string;
}

export interface DerivativeRequest {
  energy_eV: number[];
  mu: number[];
  order: 1 | 2;
  smooth_sigma?: number;
}

export interface PeakFitRequest {
  energy_eV: number[];
  d2mu: number[];
  n_peaks: number;
  initial_guesses?: Array<{ A: number; x0: number; gamma: number }>;
  energy_range: [number, number];
}

export interface SavePeakFitRequest {
  sample: string;
  dataset: string;
  roi: string;
  n_peaks: number;
  params: Record<string, PeakParams>;
  r_squared: number;
  energy_range: [number, number];
}

export interface ExportXASRequest {
  samples?: string[];
  datasets?: string[];
  rois?: string[];
  include_derivatives?: boolean;
  include_peak_fits?: boolean;
  format?: 'long' | 'wide';
}

/** Code export request - generates standalone Python script */
export interface CodeExportRequest {
  sample: string;
  dataset: string;
  roi: string;
  plotting_backend: 'matplotlib' | 'plotly';
  include_derivatives?: boolean;
}

/** Code export preview response */
export interface CodeExportPreview {
  code: string;
  filename: string;
  n_scans: number;
  plotting_backend: string;
}

/** Review progress statistics */
export interface ReviewProgress {
  total: number;
  good: number;
  ignored: number;
  unreviewed: number;
  reviewed: number;
  can_export: boolean;
}
