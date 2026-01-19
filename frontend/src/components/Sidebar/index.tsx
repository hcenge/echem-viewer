import { Box, Divider } from '@mui/material';
import type { ChartSettings, PlotType, LegendSource, LineMode, LegendPosition, HoverMode } from '../Chart';
import { CHART_DEFAULTS } from '../../constants/chart';
import { SettingSection } from './SettingSection';
import { SettingSelect } from './SettingSelect';
import { SettingNumber } from './SettingNumber';
import { SettingToggle } from './SettingToggle';
import { SettingSlider } from './SettingSlider';
import { SettingTextWithFormat } from './SettingTextWithFormat';
import { FontFormatButton } from './FontFormatButton';
import {
  PLOT_TYPES,
  LEGEND_SOURCES,
  LEGEND_POSITIONS,
  COLOR_SCHEMES,
  LINE_MODES,
  MARKER_TYPES,
  TICK_POSITIONS,
  HOVER_MODES,
  getUnitsForColumn,
} from '../../constants/chart';

interface SidebarProps {
  settings: ChartSettings;
  onSettingsChange: (settings: ChartSettings) => void;
  availableColumns: string[];
  customColumns: Record<string, Record<string, unknown>>;
}

export function Sidebar({
  settings,
  onSettingsChange,
  availableColumns,
  customColumns,
}: SidebarProps) {
  const updateSetting = <K extends keyof ChartSettings>(
    key: K,
    value: ChartSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const columnOptions = availableColumns.map((col) => ({ value: col, label: col }));

  // Get unit options for current x/y columns
  const xUnits = getUnitsForColumn(settings.xCol);
  const yUnits = getUnitsForColumn(settings.yCol);

  const showMarkerControls = settings.lineMode === 'markers' || settings.lineMode === 'lines+markers';
  const showLineControls = settings.lineMode === 'lines' || settings.lineMode === 'lines+markers';
  const showStackedControls = settings.plotType === 'y_stacked';

  // Font formats with defaults
  const titleFormat = settings.titleFormat || CHART_DEFAULTS.titleFormat!;
  const xLabelFormat = settings.xLabelFormat || CHART_DEFAULTS.xLabelFormat!;
  const yLabelFormat = settings.yLabelFormat || CHART_DEFAULTS.yLabelFormat!;
  const tickFormat = settings.tickFormat || CHART_DEFAULTS.tickFormat!;
  const legendFormat = settings.legendFormat || CHART_DEFAULTS.legendFormat!;

  // Get custom column names and determine which are numeric
  const customColumnNames = new Set<string>();
  Object.values(customColumns).forEach((cols) => {
    Object.keys(cols).forEach((name) => customColumnNames.add(name));
  });

  // Legend source options - include custom columns with (gradient) suffix for numeric
  const legendSourceOptions = [
    ...LEGEND_SOURCES,
    ...Array.from(customColumnNames).map((colName) => {
      // Check if all values for this column are numeric
      const values = Object.values(customColumns)
        .map((cols) => cols[colName])
        .filter((v) => v !== undefined && v !== '');
      const isNumeric = values.length > 0 && values.every((v) => !isNaN(Number(v)));
      return {
        value: `custom:${colName}`,
        label: `${colName}${isNumeric ? ' (gradient)' : ''}`,
      };
    }),
  ];

  return (
    <Box sx={{ width: 280, flexShrink: 0 }}>
      {/* Axes Section */}
      <SettingSection title="Axes">
        <SettingSelect
          label="X Column"
          value={settings.xCol}
          options={columnOptions}
          onChange={(v) => {
            updateSetting('xCol', v);
            // Reset unit when column changes
            updateSetting('xUnit', undefined);
          }}
        />
        {xUnits && (
          <SettingSelect
            label="X Unit"
            value={settings.xUnit || xUnits[0].value}
            options={xUnits.map((u) => ({ value: u.value, label: u.label }))}
            onChange={(v) => updateSetting('xUnit', v)}
          />
        )}

        <SettingSelect
          label="Y Column"
          value={settings.yCol}
          options={columnOptions}
          onChange={(v) => {
            updateSetting('yCol', v);
            // Reset unit when column changes
            updateSetting('yUnit', undefined);
          }}
        />
        {yUnits && (
          <SettingSelect
            label="Y Unit"
            value={settings.yUnit || yUnits[0].value}
            options={yUnits.map((u) => ({ value: u.value, label: u.label }))}
            onChange={(v) => updateSetting('yUnit', v)}
          />
        )}

        <Divider />

        <SettingTextWithFormat
          label="X Axis Label"
          value={settings.xLabel || ''}
          onChange={(v) => updateSetting('xLabel', v || undefined)}
          format={xLabelFormat}
          onFormatChange={(f) => updateSetting('xLabelFormat', f)}
          placeholder="Auto"
        />
        <SettingTextWithFormat
          label="Y Axis Label"
          value={settings.yLabel || ''}
          onChange={(v) => updateSetting('yLabel', v || undefined)}
          format={yLabelFormat}
          onFormatChange={(f) => updateSetting('yLabelFormat', f)}
          placeholder="Auto"
        />

        <Divider />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <SettingToggle
            label="X Log"
            checked={settings.xLog || false}
            onChange={(v) => updateSetting('xLog', v)}
          />
          <SettingToggle
            label="Y Log"
            checked={settings.yLog || false}
            onChange={(v) => updateSetting('yLog', v)}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <SettingToggle
            label="X Invert"
            checked={settings.xInvert || false}
            onChange={(v) => updateSetting('xInvert', v)}
          />
          <SettingToggle
            label="Y Invert"
            checked={settings.yInvert || false}
            onChange={(v) => updateSetting('yInvert', v)}
          />
        </Box>

        <Divider />

        <Box sx={{ display: 'flex', gap: 1 }}>
          <SettingNumber
            label="X Min"
            value={settings.xMin ?? ''}
            onChange={(v) => updateSetting('xMin', v === '' ? undefined : v as number)}
            placeholder="Auto"
          />
          <SettingNumber
            label="X Max"
            value={settings.xMax ?? ''}
            onChange={(v) => updateSetting('xMax', v === '' ? undefined : v as number)}
            placeholder="Auto"
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <SettingNumber
            label="Y Min"
            value={settings.yMin ?? ''}
            onChange={(v) => updateSetting('yMin', v === '' ? undefined : v as number)}
            placeholder="Auto"
          />
          <SettingNumber
            label="Y Max"
            value={settings.yMax ?? ''}
            onChange={(v) => updateSetting('yMax', v === '' ? undefined : v as number)}
            placeholder="Auto"
          />
        </Box>
      </SettingSection>

      {/* Layout Section */}
      <SettingSection title="Layout & Legend">
        <SettingTextWithFormat
          label="Plot Title"
          value={settings.title || ''}
          onChange={(v) => updateSetting('title', v || undefined)}
          format={titleFormat}
          onFormatChange={(f) => updateSetting('titleFormat', f)}
          placeholder="None"
        />

        <SettingSelect
          label="Plot Type"
          value={settings.plotType}
          options={[...PLOT_TYPES]}
          onChange={(v) => updateSetting('plotType', v as PlotType)}
        />

        {showStackedControls && (
          <>
            <SettingSlider
              label="Stacked Gap"
              value={settings.stackedGap || 5}
              onChange={(v) => updateSetting('stackedGap', v)}
              min={0}
              max={20}
              step={1}
              valueSuffix="%"
            />
            <SettingToggle
              label="Hide Y Labels"
              checked={settings.hideYLabels || false}
              onChange={(v) => updateSetting('hideYLabels', v)}
            />
          </>
        )}

        <Box sx={{ display: 'flex', gap: 1 }}>
          <SettingNumber
            label="Width (px)"
            value={settings.width ?? ''}
            onChange={(v) => updateSetting('width', v === '' ? undefined : v as number)}
            min={300}
            max={2000}
            step={50}
            placeholder="Auto"
          />
          <SettingNumber
            label="Height (px)"
            value={settings.height || 500}
            onChange={(v) => updateSetting('height', v === '' ? 500 : v as number)}
            min={200}
            max={1200}
            step={50}
          />
        </Box>

         <Divider />

        <SettingToggle
          label="Show Legend"
          checked={settings.showLegend !== false}
          onChange={(v) => updateSetting('showLegend', v)}
        />
        <SettingSelect
          label="Legend Labels"
          value={settings.legendSource || 'label'}
          options={legendSourceOptions}
          onChange={(v) => updateSetting('legendSource', v as LegendSource)}
          disabled={settings.showLegend === false}
        />
        <SettingSelect
          label="Legend Position"
          value={settings.legendPosition || 'right'}
          options={[...LEGEND_POSITIONS]}
          onChange={(v) => updateSetting('legendPosition', v as LegendPosition)}
          disabled={settings.showLegend === false}
        />
      </SettingSection>

      {/* Appearance Section */}
      <SettingSection title="Appearance">
        <SettingSelect
          label="Color Scheme"
          value={settings.colorScheme || 'Viridis'}
          options={[...COLOR_SCHEMES]}
          onChange={(v) => updateSetting('colorScheme', v)}
        />

        <SettingSelect
          label="Line Mode"
          value={settings.lineMode || 'lines'}
          options={[...LINE_MODES]}
          onChange={(v) => updateSetting('lineMode', v as LineMode)}
        />

        {showLineControls && (
          <SettingSlider
            label="Line Width"
            value={settings.lineWidth || 2}
            onChange={(v) => updateSetting('lineWidth', v)}
            min={1}
            max={6}
            step={0.5}
          />
        )}

        {showMarkerControls && (
          <>
            <SettingSelect
              label="Marker Type"
              value={settings.markerType || 'circle'}
              options={[...MARKER_TYPES]}
              onChange={(v) => updateSetting('markerType', v)}
            />
            <SettingSlider
              label="Marker Size"
              value={settings.markerSize || 6}
              onChange={(v) => updateSetting('markerSize', v)}
              min={2}
              max={16}
              step={1}
            />
          </>
        )}

        <Divider />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <SettingToggle
            label="Show Grid"
            checked={settings.showGrid !== false}
            onChange={(v) => updateSetting('showGrid', v)}
          />
          <SettingToggle
            label="All Axes"
            checked={settings.showAllAxes !== false}
            onChange={(v) => updateSetting('showAllAxes', v)}
          />
        </Box>

        <SettingSelect
          label="Tick Position"
          value={settings.tickPosition || 'inside'}
          options={[...TICK_POSITIONS]}
          onChange={(v) => updateSetting('tickPosition', v as 'inside' | 'outside')}
        />

        <Box sx={{ display: 'flex', gap: 1 }}>
          <SettingNumber
            label="Axis Width"
            value={settings.axisLineWidth || 1}
            onChange={(v) => updateSetting('axisLineWidth', v === '' ? 1 : v as number)}
            min={1}
            max={10}
            step={0.5}
          />
          <SettingNumber
            label="Tick Width"
            value={settings.tickWidth || 1}
            onChange={(v) => updateSetting('tickWidth', v === '' ? 1 : v as number)}
            min={1}
            max={10}
            step={0.5}
          />
        </Box>

        <Divider />

        <SettingSelect
          label="Hover Mode"
          value={String(settings.hoverMode ?? 'x unified')}
          options={HOVER_MODES.map((m) => ({ value: String(m.value), label: m.label }))}
          onChange={(v) => updateSetting('hoverMode', v === 'false' ? false : v as HoverMode)}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <span style={{ fontSize: '0.875rem', color: 'rgba(0,0,0,0.6)' }}>Ticks</span>
            <FontFormatButton
              format={tickFormat}
              onFormatChange={(f) => updateSetting('tickFormat', f)}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <span style={{ fontSize: '0.875rem', color: 'rgba(0,0,0,0.6)' }}>Legend</span>
            <FontFormatButton
              format={legendFormat}
              onFormatChange={(f) => updateSetting('legendFormat', f)}
            />
          </Box>
        </Box>
      </SettingSection>

    </Box>
  );
}
