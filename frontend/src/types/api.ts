/**
 * API types matching backend Pydantic models
 */

export interface FileInfo {
  filename: string;
  label: string;
  technique: string | null;
  timestamp: string | null;
  source: string | null;
  cycles: number[];
  columns: string[];
  custom: Record<string, unknown>;  // Custom column values for this file
}

export interface MetadataUpdate {
  label?: string;
  custom?: Record<string, unknown>;
}

export interface DataRequest {
  x_col: string;
  y_col: string;
  cycles?: number[];
  max_points?: number;  // Downsample if more points than this
}

export interface SessionStats {
  file_count: number;
  max_files: number;
  files_remaining: number;
  memory_mb: number;
  max_file_size_mb: number;
}

export interface DataResponse {
  x: number[];
  y: number[];
}

// Plot configuration for export (simplified version sent to backend)
export interface PlotConfigExport {
  id: string;
  name: string;
  selected_files: string[];
  selected_cycles: Record<string, number[]>;
  settings: Record<string, unknown>;
}

export interface ExportRequest {
  files: string[];
  format: 'parquet' | 'csv';
  code_style: 'plotly' | 'matplotlib';
  plot_settings?: Record<string, unknown>;
  plots?: PlotConfigExport[];
  file_metadata?: Record<string, Record<string, unknown>>;
}

export interface UploadResponse {
  files: FileInfo[];
  plots: PlotConfigExport[] | null;  // Restored plots from session import
}

export interface TechniquesResponse {
  techniques: string[];
  defaults: Record<string, { x: string; y: string }>;
}

// Plot configuration for multi-plot sessions
export interface PlotConfig {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  selectedFiles: string[];
  selectedCycles: Record<string, number[]>;
  settings: import('../constants/chart').ChartSettings;
}
