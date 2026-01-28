import { Checkbox, TableCell, TableHead, TableRow } from '@mui/material';
import { CustomColumnHeader } from './CustomColumnHeader';

interface FileTableHeaderProps {
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  showCyclesColumn: boolean;
  showLinkedPeisColumn: boolean;
  showExtendedColumns: boolean;
  analysisColumnNames: string[];
  customColumnNames: string[];
  onCustomColumnRename: (oldName: string, newName: string) => void;
  onCustomColumnDelete: (name: string) => void;
}

export function FileTableHeader({
  allSelected,
  someSelected,
  onSelectAll,
  showCyclesColumn,
  showLinkedPeisColumn,
  showExtendedColumns,
  analysisColumnNames,
  customColumnNames,
  onCustomColumnRename,
  onCustomColumnDelete,
}: FileTableHeaderProps) {
  return (
    <TableHead>
      <TableRow>
        <TableCell padding="checkbox">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={(e) => onSelectAll(e.target.checked)}
          />
        </TableCell>
        <TableCell>Filename</TableCell>
        <TableCell>Label</TableCell>
        <TableCell>Technique</TableCell>
        {/* Analysis columns (populated when user runs analysis) */}
        {analysisColumnNames.map((col) => (
          <TableCell key={`analysis-${col}`} sx={{ fontStyle: 'italic', opacity: 0.85 }}>
            {col}
          </TableCell>
        ))}
        {showCyclesColumn && <TableCell>Cycles</TableCell>}
        {showLinkedPeisColumn && <TableCell>Linked PEIS</TableCell>}
        {showExtendedColumns && (
          <>
            <TableCell>Timestamp</TableCell>
            <TableCell>Source</TableCell>
          </>
        )}
        {customColumnNames.map((col) => (
          <TableCell key={col}>
            <CustomColumnHeader
              name={col}
              onRename={onCustomColumnRename}
              onDelete={onCustomColumnDelete}
            />
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}
