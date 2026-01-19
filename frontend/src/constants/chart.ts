// Font format interface
export interface FontFormat {
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

// Chart settings types
export type PlotType = 'overlay' | 'y_stacked' | 'time_order' | 'grid';
export type LegendSource = 'label' | 'filename' | 'technique' | string;
export type LineMode = 'lines' | 'markers' | 'lines+markers';
export type LegendPosition = 'right' | 'left' | 'top' | 'bottom' | 'top_right' | 'top_left' | 'bottom_right' | 'bottom_left';
export type HoverMode = 'x unified' | 'closest' | 'x' | 'y' | false;

export interface ChartSettings {
  // Data columns
  xCol: string;
  yCol: string;
  xLabel?: string;
  yLabel?: string;

  // Unit conversion
  xUnit?: string;
  yUnit?: string;

  // Axis options
  xLog?: boolean;
  yLog?: boolean;
  xInvert?: boolean;
  yInvert?: boolean;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;

  // Layout
  plotType: PlotType;
  width?: number;
  height?: number;
  stackedGap?: number;
  hideYLabels?: boolean;
  title?: string;

  // Appearance
  colorScheme?: string;
  lineMode?: LineMode;
  lineWidth?: number;
  markerType?: string;
  markerSize?: number;
  axisLineWidth?: number;
  showGrid?: boolean;
  tickPosition?: 'inside' | 'outside';

  // Font formatting
  titleFormat?: FontFormat;
  xLabelFormat?: FontFormat;
  yLabelFormat?: FontFormat;
  tickFormat?: FontFormat;
  legendFormat?: FontFormat;

  // Axis appearance
  showAllAxes?: boolean;
  tickWidth?: number;

  // Legend
  showLegend?: boolean;
  legendSource?: LegendSource;
  legendPosition?: LegendPosition;

  // Interaction
  hoverMode?: HoverMode;
}

// Publication-quality chart defaults
export const CHART_DEFAULTS: ChartSettings = {
  // Data columns (empty by default, set by technique)
  xCol: '',
  yCol: '',

  // Layout
  plotType: 'overlay',
  height: 500,
  width: 800,
  stackedGap: 5,
  hideYLabels: false,

  // Appearance
  colorScheme: 'Viridis',
  lineMode: 'lines',
  lineWidth: 2,
  markerType: 'circle',
  markerSize: 3,
  axisLineWidth: 3,
  showGrid: true,
  tickPosition: 'inside',
  showAllAxes: true,
  tickWidth: 2,

  // Font formatting
  titleFormat: { size: 18, bold: true, italic: false, underline: false },
  xLabelFormat: { size: 16, bold: true, italic: false, underline: false },
  yLabelFormat: { size: 16, bold: true, italic: false, underline: false },
  tickFormat: { size: 14, bold: false, italic: false, underline: false },
  legendFormat: { size: 14, bold: false, italic: false, underline: false },

  // Legend
  showLegend: true,
  legendSource: 'label',
  legendPosition: 'top_right',

  // Interaction
  hoverMode: 'x unified',
};

// Helper to get a setting value with fallback to default
export function getSettingWithDefault<K extends keyof ChartSettings>(
  settings: ChartSettings,
  key: K
): NonNullable<ChartSettings[K]> {
  return (settings[key] ?? CHART_DEFAULTS[key]) as NonNullable<ChartSettings[K]>;
}

// Color schemes (Plotly colorscales)
export const COLOR_SCHEMES = [
  { value: 'Viridis', label: 'Viridis' },
  { value: 'Plasma', label: 'Plasma' },
  { value: 'Inferno', label: 'Inferno' },
  { value: 'Magma', label: 'Magma' },
  { value: 'Cividis', label: 'Cividis' },
  { value: 'Turbo', label: 'Turbo' },
  { value: 'Blues', label: 'Blues' },
  { value: 'Reds', label: 'Reds' },
  { value: 'Greens', label: 'Greens' },
  { value: 'Spectral', label: 'Spectral' },
] as const;

// Line modes
export const LINE_MODES = [
  { value: 'lines', label: 'Lines' },
  { value: 'markers', label: 'Markers' },
  { value: 'lines+markers', label: 'Lines + Markers' },
] as const;

// Marker types
export const MARKER_TYPES = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'cross', label: 'Cross' },
  { value: 'x', label: 'X' },
  { value: 'triangle-up', label: 'Triangle Up' },
  { value: 'triangle-down', label: 'Triangle Down' },
  { value: 'star', label: 'Star' },
  { value: 'hexagon', label: 'Hexagon' },
] as const;

// Legend positions
export const LEGEND_POSITIONS = [
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'top_right', label: 'Top Right' },
  { value: 'top_left', label: 'Top Left' },
  { value: 'bottom_right', label: 'Bottom Right' },
  { value: 'bottom_left', label: 'Bottom Left' },
] as const;

// Plot types
export const PLOT_TYPES = [
  { value: 'overlay', label: 'Overlay' },
  { value: 'time_order', label: 'Time Order' },
  { value: 'y_stacked', label: 'Y Stacked' },
  { value: 'grid', label: 'Grid' },
] as const;

// Legend sources
export const LEGEND_SOURCES = [
  { value: 'label', label: 'File Label' },
  { value: 'filename', label: 'Filename' },
  { value: 'technique', label: 'Technique' },
] as const;

// Tick positions
export const TICK_POSITIONS = [
  { value: 'inside', label: 'Inside' },
  { value: 'outside', label: 'Outside' },
] as const;

// Hover modes
export const HOVER_MODES = [
  { value: 'x unified', label: 'X Unified' },
  { value: 'closest', label: 'Closest' },
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
  { value: false, label: 'None' },
] as const;

// Unit options for different measurement types
export const TIME_UNITS = [
  { value: 's', label: 'Seconds (s)', factor: 1 },
  { value: 'ms', label: 'Milliseconds (ms)', factor: 1000 },
  { value: 'min', label: 'Minutes (min)', factor: 1 / 60 },
  { value: 'h', label: 'Hours (h)', factor: 1 / 3600 },
] as const;

export const CURRENT_UNITS = [
  { value: 'A', label: 'Amperes (A)', factor: 1 },
  { value: 'mA', label: 'Milliamperes (mA)', factor: 1000 },
  { value: 'µA', label: 'Microamperes (µA)', factor: 1e6 },
  { value: 'nA', label: 'Nanoamperes (nA)', factor: 1e9 },
] as const;

export const POTENTIAL_UNITS = [
  { value: 'V', label: 'Volts (V)', factor: 1 },
  { value: 'mV', label: 'Millivolts (mV)', factor: 1000 },
] as const;

export const IMPEDANCE_UNITS = [
  { value: 'Ohm', label: 'Ohms (Ω)', factor: 1 },
  { value: 'kOhm', label: 'Kilohms (kΩ)', factor: 0.001 },
  { value: 'mOhm', label: 'Milliohms (mΩ)', factor: 1000 },
] as const;

export const FREQUENCY_UNITS = [
  { value: 'Hz', label: 'Hertz (Hz)', factor: 1 },
  { value: 'kHz', label: 'Kilohertz (kHz)', factor: 0.001 },
  { value: 'MHz', label: 'Megahertz (MHz)', factor: 1e-6 },
] as const;

// Map column names to their unit type
export const COLUMN_UNIT_MAP: Record<string, typeof TIME_UNITS | typeof CURRENT_UNITS | typeof POTENTIAL_UNITS | typeof IMPEDANCE_UNITS | typeof FREQUENCY_UNITS> = {
  time_s: TIME_UNITS,
  current_A: CURRENT_UNITS,
  potential_V: POTENTIAL_UNITS,
  z_real_Ohm: IMPEDANCE_UNITS,
  z_imag_Ohm: IMPEDANCE_UNITS,
  z_mag_Ohm: IMPEDANCE_UNITS,
  frequency_Hz: FREQUENCY_UNITS,
};

// Get unit options for a column
export function getUnitsForColumn(columnName: string) {
  return COLUMN_UNIT_MAP[columnName] || null;
}

// Get conversion factor for a unit
export function getUnitFactor(units: readonly { value: string; label: string; factor: number }[], unitValue: string): number {
  const unit = units.find((u) => u.value === unitValue);
  return unit?.factor ?? 1;
}

// Generate colors from a color scheme
export function getColorsFromScheme(scheme: string, count: number): string[] {
  // Plotly color scales - we'll sample colors from them
  const colorScales: Record<string, string[]> = {
    Viridis: ['#440154', '#482878', '#3e4a89', '#31688e', '#26838f', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
    Plasma: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],
    Inferno: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'],
    Magma: ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2f7f', '#cd4071', '#f1605d', '#fd9668', '#feca8d', '#fcfdbf'],
    Cividis: ['#00224e', '#123570', '#3b496c', '#575d6d', '#707173', '#8a8678', '#a59c74', '#c3b369', '#e1cc55', '#fee838'],
    Turbo: ['#30123b', '#4662d7', '#35aaf9', '#1ae4b6', '#72fe5e', '#c8ef34', '#faba39', '#f66b19', '#ca2a04', '#7a0403'],
    Blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
    Reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
    Greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
    Spectral: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'],
  };

  const scale = colorScales[scheme] || colorScales.Viridis;
  const colors: string[] = [];

  for (let i = 0; i < count; i++) {
    const index = Math.floor((i / Math.max(count - 1, 1)) * (scale.length - 1));
    colors.push(scale[index]);
  }

  return colors;
}
