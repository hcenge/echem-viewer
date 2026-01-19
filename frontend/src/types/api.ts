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
}

export interface DataResponse {
  x: number[];
  y: number[];
}

export interface ExportRequest {
  files: string[];
  format: 'parquet' | 'csv';
  code_style: 'plotly' | 'matplotlib';
  plot_settings?: Record<string, unknown>;
}

export interface TechniquesResponse {
  techniques: string[];
  defaults: Record<string, { x: string; y: string }>;
}
