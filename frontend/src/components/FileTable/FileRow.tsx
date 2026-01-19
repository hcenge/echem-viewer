import { Checkbox, Chip, TableCell, TableRow } from '@mui/material';
import type { FileInfo } from '../../types/api';
import { EditableCell } from './EditableCell';
import { CycleSelector } from './CycleSelector';

interface FileRowProps {
  file: FileInfo;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onLabelChange: (newLabel: string) => void;
  showCyclesColumn: boolean;
  selectedCycles: number[];
  onCyclesChange: (cycles: number[]) => void;
  showExtendedColumns: boolean;
  customColumnNames: string[];
  customColumnValues: Record<string, unknown>;
  onCustomCellChange: (columnName: string, value: string) => void;
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
  customColumnNames,
  customColumnValues,
  onCustomCellChange,
}: FileRowProps) {
  const hasCycles = file.cycles && file.cycles.length > 0;

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
