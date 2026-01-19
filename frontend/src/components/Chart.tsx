import { useState, useEffect, useMemo } from 'react';
import Plot from 'react-plotly.js';
import { Box, CircularProgress, Typography } from '@mui/material';
import type { Data, Layout } from 'plotly.js';
import type { FileInfo, DataResponse } from '../types/api';

import {
  getColorsFromScheme,
  getUnitFactor,
  getUnitsForColumn,
  CHART_DEFAULTS,
  type ChartSettings,
  type FontFormat,
} from '../constants/chart';

// Re-export types for external use
export type { ChartSettings, FontFormat } from '../constants/chart';
export type { PlotType, LegendSource, LineMode, LegendPosition, HoverMode } from '../constants/chart';

// Helper to get legend position config
function getLegendConfig(position: string) {
  const configs: Record<string, { x: number; y: number; xanchor: 'left' | 'right' | 'center'; yanchor: 'top' | 'bottom' | 'middle' }> = {
    right: { x: 1.02, y: 1, xanchor: 'left', yanchor: 'top' },
    left: { x: -0.02, y: 1, xanchor: 'right', yanchor: 'top' },
    top: { x: 0.5, y: 1.02, xanchor: 'center', yanchor: 'bottom' },
    bottom: { x: 0.5, y: -0.1, xanchor: 'center', yanchor: 'top' },
    top_right: { x: 1, y: 1, xanchor: 'right', yanchor: 'top' },
    top_left: { x: 0, y: 1, xanchor: 'left', yanchor: 'top' },
    bottom_right: { x: 1, y: 0, xanchor: 'right', yanchor: 'bottom' },
    bottom_left: { x: 0, y: 0, xanchor: 'left', yanchor: 'bottom' },
  };
  return configs[position] || configs.right;
}

// Helper to get setting with default fallback
function d<K extends keyof ChartSettings>(settings: ChartSettings, key: K): NonNullable<ChartSettings[K]> {
  return (settings[key] ?? CHART_DEFAULTS[key]) as NonNullable<ChartSettings[K]>;
}

interface ChartProps {
  files: FileInfo[];
  selectedFiles: string[];
  settings: ChartSettings;
  getData: (filename: string, xCol: string, yCol: string, cycles?: number[]) => Promise<DataResponse>;
  selectedCycles?: Record<string, number[]>;
  customColumns?: Record<string, Record<string, unknown>>;
}

interface TraceData {
  filename: string;
  label: string;
  technique: string | null;
  timestamp: string | null;
  x: number[];
  y: number[];
}

export function Chart({
  files,
  selectedFiles,
  settings,
  getData,
  selectedCycles,
  customColumns = {},
}: ChartProps) {
  const [traceData, setTraceData] = useState<TraceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get file info map for quick lookup
  const fileInfoMap = useMemo(() => {
    const map: Record<string, FileInfo> = {};
    files.forEach((f) => (map[f.filename] = f));
    return map;
  }, [files]);

  // Fetch data when selection or settings change
  useEffect(() => {
    if (selectedFiles.length === 0 || !settings.xCol || !settings.yCol) {
      setTraceData([]);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const results: TraceData[] = [];

        for (const filename of selectedFiles) {
          const fileInfo = fileInfoMap[filename];
          if (!fileInfo) continue;

          const cycles = selectedCycles?.[filename];
          const data = await getData(filename, settings.xCol, settings.yCol, cycles);

          if (cancelled) return;

          results.push({
            filename,
            label: fileInfo.label,
            technique: fileInfo.technique,
            timestamp: fileInfo.timestamp,
            x: data.x,
            y: data.y,
          });
        }

        if (!cancelled) {
          setTraceData(results);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to fetch data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [selectedFiles, settings.xCol, settings.yCol, selectedCycles, fileInfoMap, getData]);

  // Helper to get trace name
  const getTraceName = (trace: TraceData) => {
    const legendSource = d(settings, 'legendSource');

    // Handle custom column legend source
    if (legendSource.startsWith('custom:')) {
      const colName = legendSource.slice(7); // Remove 'custom:' prefix
      const fileCustom = customColumns[trace.filename];
      const value = fileCustom?.[colName];
      return value !== undefined ? String(value) : trace.label;
    }

    switch (legendSource) {
      case 'filename':
        return trace.filename;
      case 'technique':
        return trace.technique || trace.filename;
      default:
        return trace.label;
    }
  };

  // Build Plotly traces and layout based on plot type
  const { plotData, layout } = useMemo(() => {
    const numTraces = traceData.length;
    const plotType = settings.plotType;

    // Get unit conversion factors
    const xUnits = getUnitsForColumn(settings.xCol);
    const yUnits = getUnitsForColumn(settings.yCol);
    const xFactor = xUnits && settings.xUnit ? getUnitFactor(xUnits, settings.xUnit) : 1;
    const yFactor = yUnits && settings.yUnit ? getUnitFactor(yUnits, settings.yUnit) : 1;

    // Build axis labels with units
    const xUnitLabel = settings.xUnit || (settings.xCol.includes('_') ? settings.xCol.split('_').pop() : '');
    const yUnitLabel = settings.yUnit || (settings.yCol.includes('_') ? settings.yCol.split('_').pop() : '');
    const xLabel = settings.xLabel || `${settings.xCol.split('_')[0]}${xUnitLabel ? ` (${xUnitLabel})` : ''}`;
    const yLabel = settings.yLabel || `${settings.yCol.split('_')[0]}${yUnitLabel ? ` (${yUnitLabel})` : ''}`;

    // Get colors from scheme
    const colors = getColorsFromScheme(d(settings, 'colorScheme'), numTraces);

    // Appearance settings
    const lineMode = d(settings, 'lineMode');
    const lineWidth = d(settings, 'lineWidth');
    const markerType = d(settings, 'markerType');
    const markerSize = d(settings, 'markerSize');
    const axisLineWidth = d(settings, 'axisLineWidth');

    // Stacked gap (as fraction)
    const stackedGap = d(settings, 'stackedGap') / 100;

    // Legend position config
    const legendConfig = getLegendConfig(d(settings, 'legendPosition'));

    // Font formatting
    const titleFormat = d(settings, 'titleFormat');
    const xLabelFormat = d(settings, 'xLabelFormat');
    const yLabelFormat = d(settings, 'yLabelFormat');
    const tickFormat = d(settings, 'tickFormat');
    const legendFormat = d(settings, 'legendFormat');

    // Helper to build Plotly font config
    const buildFontConfig = (format: FontFormat) => ({
      size: format.size,
      weight: format.bold ? 'bold' as const : undefined,
      style: format.italic ? 'italic' as const : undefined,
    });

    // Grid and tick settings
    const showGrid = d(settings, 'showGrid');
    const tickPosition = d(settings, 'tickPosition');
    const showAllAxes = d(settings, 'showAllAxes');
    const tickWidth = d(settings, 'tickWidth');

    // Base axis config
    const xAxisBase: Record<string, unknown> = {
      type: settings.xLog ? 'log' as const : 'linear' as const,
      autorange: settings.xInvert ? 'reversed' as const : true as const,
      linewidth: axisLineWidth,
      gridwidth: 1,
      showgrid: showGrid,
      zeroline: false,
      ticks: tickPosition,
      tickwidth: tickWidth,
      tickfont: buildFontConfig(tickFormat),
      showline: true,
      mirror: showAllAxes ? 'allticks' : false,
    };
    const yAxisBase: Record<string, unknown> = {
      type: settings.yLog ? 'log' as const : 'linear' as const,
      autorange: settings.yInvert ? 'reversed' as const : true as const,
      linewidth: axisLineWidth,
      gridwidth: 1,
      showgrid: showGrid,
      zeroline: false,
      ticks: tickPosition,
      tickwidth: tickWidth,
      tickfont: buildFontConfig(tickFormat),
      showline: true,
      mirror: showAllAxes ? 'allticks' : false,
    };

    // Apply axis range limits if set
    if (settings.xMin !== undefined || settings.xMax !== undefined) {
      xAxisBase.autorange = false;
      xAxisBase.range = [settings.xMin ?? null, settings.xMax ?? null];
    }
    if (settings.yMin !== undefined || settings.yMax !== undefined) {
      yAxisBase.autorange = false;
      yAxisBase.range = [settings.yMin ?? null, settings.yMax ?? null];
    }

    // Gradient mode: auto-detect if legend source is a numeric custom column
    const legendSource = d(settings, 'legendSource');
    let gradientColumn: string | null = null;
    let colorByValues: number[] | null = null;
    let colorByMin = 0;
    let colorByMax = 1;
    let isGradientMode = false;

    if (legendSource.startsWith('custom:')) {
      const colName = legendSource.slice(7); // Remove 'custom:' prefix
      // Get values for each trace from customColumns
      const values = traceData.map((trace) => {
        const fileCustom = customColumns[trace.filename];
        const val = fileCustom?.[colName];
        return val !== undefined && val !== '' ? Number(val) : NaN;
      });

      // Check if all values are numeric - if so, use gradient mode
      isGradientMode = values.length > 0 && values.every((v) => !isNaN(v));
      if (isGradientMode) {
        gradientColumn = colName;
        colorByValues = values;
        colorByMin = Math.min(...values);
        colorByMax = Math.max(...values);
      }
    }

    // Helper to create a colorbar-only trace (invisible, just for showing the colorbar)
    const buildColorbarTrace = (): Data => ({
      x: [null],
      y: [null],
      type: 'scatter' as const,
      mode: 'markers',
      marker: {
        size: 0,
        color: colorByValues || [colorByMin, colorByMax],
        colorscale: d(settings, 'colorScheme'),
        cmin: colorByMin,
        cmax: colorByMax,
        showscale: true,
        colorbar: {
          title: { text: gradientColumn || '', font: buildFontConfig(legendFormat) },
          tickfont: buildFontConfig(legendFormat),
          len: 0.75,
          thickness: 15,
        },
      },
      showlegend: false,
      hoverinfo: 'skip',
    });

    // Helper to build trace config
    const buildTrace = (trace: TraceData, index: number, xData: number[], yData: number[]) => {
      const baseTrace = {
        x: xData.map((v) => v * xFactor),
        y: yData.map((v) => v * yFactor),
        type: 'scatter' as const,
        mode: lineMode as 'lines' | 'markers' | 'lines+markers',
        name: getTraceName(trace),
      };

      if (isGradientMode && colorByValues) {
        const colorValue = colorByValues[index];
        // Sample color from the colorscale array for line coloring
        const normalizedValue = colorByMax > colorByMin
          ? (colorValue - colorByMin) / (colorByMax - colorByMin)
          : 0.5;
        const colorIndex = Math.floor(normalizedValue * (colors.length - 1));
        const traceColor = colors[Math.max(0, Math.min(colorIndex, colors.length - 1))];

        return {
          ...baseTrace,
          line: { color: traceColor, width: lineWidth },
          marker: {
            symbol: markerType,
            size: markerSize,
            color: traceColor,
          },
          showlegend: false,
          hovertemplate: `${gradientColumn}: ${colorValue}<extra></extra>`,
        };
      }

      return {
        ...baseTrace,
        line: { color: colors[index % colors.length], width: lineWidth },
        marker: { symbol: markerType, size: markerSize, color: colors[index % colors.length] },
      };
    };

    // Overlay mode - all on same axes
    if (plotType === 'overlay' || numTraces <= 1) {
      const traces: Data[] = traceData.map((trace, index) =>
        buildTrace(trace, index, trace.x, trace.y)
      );
      // Add colorbar trace if in gradient mode
      if (isGradientMode) {
        traces.push(buildColorbarTrace());
      }

      const layoutConfig: Partial<Layout> = {
        autosize: true,
        width: settings.width,
        height: d(settings, 'height'),
        margin: { l: 60, r: showAllAxes ? 60 : 30, t: settings.title ? 50 : 30, b: 50 },
        title: settings.title ? {
          text: settings.title,
          font: buildFontConfig(titleFormat),
          xref: 'paper',
          x: 0.5,
          xanchor: 'center',
        } : undefined,
        xaxis: { ...xAxisBase, title: { text: xLabel, font: buildFontConfig(xLabelFormat) } } as Layout['xaxis'],
        yaxis: { ...yAxisBase, title: { text: yLabel, font: buildFontConfig(yLabelFormat), standoff: 15 } } as Layout['yaxis'],
        showlegend: d(settings, 'showLegend'),
        legend: { ...legendConfig, font: buildFontConfig(legendFormat) },
        hovermode: d(settings, 'hoverMode'),
      };

      return { plotData: traces, layout: layoutConfig };
    }

    // Y-stacked mode - shared x-axis, separate y-axes (rows)
    if (plotType === 'y_stacked') {
      const plotHeight = (1 - stackedGap * (numTraces - 1)) / numTraces;

      const traces: Data[] = traceData.map((trace, index) => ({
        ...buildTrace(trace, index, trace.x, trace.y),
        xaxis: 'x',
        yaxis: index === 0 ? 'y' : `y${index + 1}`,
      }));
      // Add colorbar trace if in gradient mode
      if (isGradientMode) {
        traces.push(buildColorbarTrace());
      }

      const layoutConfig: Partial<Layout> = {
        autosize: true,
        width: settings.width,
        height: d(settings, 'height'),
        margin: { l: 60, r: showAllAxes ? 60 : 30, t: settings.title ? 50 : 30, b: 50 },
        title: settings.title ? {
          text: settings.title,
          font: buildFontConfig(titleFormat),
          xref: 'paper',
          x: 0.5,
          xanchor: 'center',
        } : undefined,
        showlegend: d(settings, 'showLegend'),
        legend: { ...legendConfig, font: buildFontConfig(legendFormat) },
        hovermode: d(settings, 'hoverMode'),
        xaxis: { ...xAxisBase, title: { text: xLabel, font: buildFontConfig(xLabelFormat) } } as Layout['xaxis'],
      };

      // Add y-axes for each trace
      traceData.forEach((_, index) => {
        const domain: [number, number] = [
          1 - (index + 1) * plotHeight - index * stackedGap,
          1 - index * plotHeight - index * stackedGap,
        ];
        const axisKey = index === 0 ? 'yaxis' : `yaxis${index + 1}`;
        const showLabel = !settings.hideYLabels && index === Math.floor(numTraces / 2);
        (layoutConfig as Record<string, unknown>)[axisKey] = {
          ...yAxisBase,
          domain,
          title: { text: showLabel ? yLabel : '', font: buildFontConfig(yLabelFormat), standoff: 15 },
        };
      });

      return { plotData: traces, layout: layoutConfig };
    }

    // Time order mode - sort by timestamp and offset x values sequentially
    if (plotType === 'time_order') {
      // Sort traces by timestamp
      const sortedTraces = [...traceData].sort((a, b) => {
        const timeA = a.timestamp || '';
        const timeB = b.timestamp || '';
        return timeA.localeCompare(timeB);
      });

      // Apply cumulative x-offset to each trace
      let xOffset = 0;
      const traces: Data[] = sortedTraces.map((trace, index) => {
        const offsetX = trace.x.map((val) => val + xOffset);
        // Update offset for next trace (use max x value of current trace)
        const maxX = trace.x.length > 0 ? Math.max(...trace.x) : 0;
        xOffset += maxX;

        return buildTrace(trace, index, offsetX, trace.y);
      });
      // Add colorbar trace if in gradient mode
      if (isGradientMode) {
        traces.push(buildColorbarTrace());
      }

      const layoutConfig: Partial<Layout> = {
        autosize: true,
        width: settings.width,
        height: d(settings, 'height'),
        margin: { l: 60, r: showAllAxes ? 60 : 30, t: settings.title ? 50 : 30, b: 50 },
        title: settings.title ? {
          text: settings.title,
          font: buildFontConfig(titleFormat),
          xref: 'paper',
          x: 0.5,
          xanchor: 'center',
        } : undefined,
        xaxis: { ...xAxisBase, title: { text: xLabel, font: buildFontConfig(xLabelFormat) } } as Layout['xaxis'],
        yaxis: { ...yAxisBase, title: { text: yLabel, font: buildFontConfig(yLabelFormat), standoff: 15 } } as Layout['yaxis'],
        showlegend: d(settings, 'showLegend'),
        legend: { ...legendConfig, font: buildFontConfig(legendFormat) },
        hovermode: d(settings, 'hoverMode'),
      };

      return { plotData: traces, layout: layoutConfig };
    }

    // Grid mode - separate subplot per file
    const cols = Math.ceil(Math.sqrt(numTraces));
    const rows = Math.ceil(numTraces / cols);
    const xGap = 0.08;
    const yGap = 0.12;
    const plotWidth = (1 - xGap * (cols - 1)) / cols;
    const plotHeight = (1 - yGap * (rows - 1)) / rows;

    const traces: Data[] = traceData.map((trace, index) => ({
      ...buildTrace(trace, index, trace.x, trace.y),
      xaxis: index === 0 ? 'x' : `x${index + 1}`,
      yaxis: index === 0 ? 'y' : `y${index + 1}`,
    }));
    // Add colorbar trace if in gradient mode
    if (isGradientMode) {
      traces.push(buildColorbarTrace());
    }

    const layoutConfig: Partial<Layout> = {
      autosize: true,
      width: settings.width,
      height: d(settings, 'height'),
      margin: { l: 50, r: showAllAxes ? 50 : 30, t: settings.title ? 50 : 30, b: 50 },
      title: settings.title ? {
          text: settings.title,
          font: buildFontConfig(titleFormat),
          xref: 'paper',
          x: 0.5,
          xanchor: 'center',
        } : undefined,
      showlegend: d(settings, 'showLegend'),
      legend: { ...legendConfig, font: buildFontConfig(legendFormat) },
      hovermode: d(settings, 'hoverMode'),
    };

    // Add axes for each subplot in grid
    traceData.forEach((_, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const xDomain: [number, number] = [
        col * plotWidth + col * xGap,
        (col + 1) * plotWidth + col * xGap,
      ];
      const yDomain: [number, number] = [
        1 - (row + 1) * plotHeight - row * yGap,
        1 - row * plotHeight - row * yGap,
      ];

      const xAxisKey = index === 0 ? 'xaxis' : `xaxis${index + 1}`;
      const yAxisKey = index === 0 ? 'yaxis' : `yaxis${index + 1}`;

      // Smaller font for grid labels
      const gridXFormat = { ...xLabelFormat, size: Math.max(xLabelFormat.size - 4, 8) };
      const gridYFormat = { ...yLabelFormat, size: Math.max(yLabelFormat.size - 4, 8) };
      (layoutConfig as Record<string, unknown>)[xAxisKey] = {
        ...xAxisBase,
        domain: xDomain,
        title: { text: row === rows - 1 ? xLabel : '', font: buildFontConfig(gridXFormat) },
      };
      (layoutConfig as Record<string, unknown>)[yAxisKey] = {
        ...yAxisBase,
        domain: yDomain,
        title: { text: col === 0 ? yLabel : '', font: buildFontConfig(gridYFormat), standoff: 10 },
      };
    });

    return { plotData: traces, layout: layoutConfig };
  }, [traceData, settings, getTraceName]);

  // Show empty state if no files selected
  if (selectedFiles.length === 0) {
    return (
      <Box
        sx={{
          height: d(settings, 'height'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 1,
          color: 'text.secondary',
        }}
      >
        <Typography>Select files from the table to plot</Typography>
      </Box>
    );
  }

  // Show loading state
  if (loading && traceData.length === 0) {
    return (
      <Box
        sx={{
          height: d(settings, 'height'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Show error state
  if (error) {
    return (
      <Box
        sx={{
          height: d(settings, 'height'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'error.main',
        }}
      >
        <Typography>Error: {error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative' }}>
      {loading && (
        <CircularProgress
          size={24}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
          }}
        />
      )}
      <Plot
        data={plotData}
        layout={layout}
        config={{
          responsive: true,
          displayModeBar: true,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
          toImageButtonOptions: {
            format: 'png',
            filename: 'echem_plot',
            height: 800,
            width: 1200,
            scale: 2,
          },
        }}
        style={{ width: '100%' }}
      />
    </Box>
  );
}
