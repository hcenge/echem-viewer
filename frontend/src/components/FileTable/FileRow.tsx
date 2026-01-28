import { Checkbox, Chip, TableCell, TableRow } from '@mui/material';
import type { FileInfo } from '../../types/api';
import { EditableCell } from './EditableCell';
import { CycleSelector } from './CycleSelector';
import { LinkedPEISSelector } from './LinkedPEISSelector';

// Techniques that can be iR corrected (have potential and current)
const IR_CORRECTABLE_TECHNIQUES = ['CA', 'CV', 'LSV', 'CP', 'OCV'];

interface FileRowProps {
  file: FileInfo;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onLabelChange: (newLabel: string) => void;
  showCyclesColumn: boolean;
  selectedCycles: number[];
  onCyclesChange: (cycles: number[]) => void;
  showExtendedColumns: boolean;
  analysisColumnNames: string[];
  customColumnNames: string[];
  customColumnValues: Record<string, unknown>;
  onCustomCellChange: (columnName: string, value: string) => void;
  showLinkedPeisColumn: boolean;
  peisFiles: FileInfo[];
  linkedPeisFile: string;
  onLinkedPeisChange: (filename: string) => void;
}

export function FileRow({
  file,
  isSelected,
  onSelect,
  onLabelChange,
  showCyclesColumn,
  selectedCycles,
  onCyclesChange,
  showExtendedColumns,
  analysisColumnNames,
  customColumnNames,
  customColumnValues,
  onCustomCellChange,
  showLinkedPeisColumn,
  peisFiles,
  linkedPeisFile,
  onLinkedPeisChange,
}: FileRowProps) {
  const hasCycles = file.cycles && file.cycles.length > 0;
  const canLinkPeis = file.technique && IR_CORRECTABLE_TECHNIQUES.includes(file.technique);

  return (
    <TableRow selected={isSelected} hover>
      <TableCell padding="checkbox">
        <Checkbox
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
        />
      </TableCell>

      <TableCell>{file.filename}</TableCell>

      <TableCell>
        <EditableCell
          value={file.label}
          onSave={onLabelChange}
          minWidth={100}
        />
      </TableCell>

      <TableCell>
        {file.technique && <Chip label={file.technique} size="small" />}
      </TableCell>

      {/* Analysis columns (populated when user runs analysis) */}
      {analysisColumnNames.map((col) => {
        const value = file.analysis?.[col];
        return (
          <TableCell key={`analysis-${col}`} sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {value !== undefined ? (typeof value === 'number' ? value.toFixed(4) : String(value)) : '-'}
          </TableCell>
        );
      })}

      {showCyclesColumn && (
        <TableCell>
          {hasCycles ? (
            <CycleSelector
              availableCycles={file.cycles!}
              selectedCycles={selectedCycles}
              onChange={onCyclesChange}
            />
          ) : (
            <span style={{ opacity: 0.4 }}>-</span>
          )}
        </TableCell>
      )}

      {showLinkedPeisColumn && (
        <TableCell>
          {canLinkPeis ? (
            <LinkedPEISSelector
              value={linkedPeisFile}
              peisFiles={peisFiles}
              onChange={onLinkedPeisChange}
            />
          ) : (
            <span style={{ opacity: 0.4 }}>-</span>
          )}
        </TableCell>
      )}

      {showExtendedColumns && (
        <>
          <TableCell>
            {file.timestamp ? new Date(file.timestamp).toLocaleString() : '-'}
          </TableCell>
          <TableCell>{file.source || '-'}</TableCell>
        </>
      )}

      {customColumnNames.map((col) => (
        <TableCell key={col}>
          <EditableCell
            value={(customColumnValues[col] as string) || ''}
            onSave={(value) => onCustomCellChange(col, value)}
            clickToEdit
          />
        </TableCell>
      ))}
    </TableRow>
  );
}
