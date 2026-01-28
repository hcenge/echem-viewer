import { useState, useMemo } from 'react';
import { Box, Paper, Table, TableBody, TableContainer, TablePagination } from '@mui/material';
import type { FileInfo } from '../../types/api';
import { FileTableToolbar } from './FileTableToolbar';
import { FileTableHeader } from './FileTableHeader';
import { FileRow } from './FileRow';

interface FileTableProps {
  files: FileInfo[];
  selectedFiles: string[];
  onSelectionChange: (filenames: string[]) => void;
  onLabelChange: (filename: string, newLabel: string) => void;
  onDeleteSelected: (filenames: string[]) => void;
  onUpload?: (files: File[]) => Promise<void>;
  onCustomColumnAdd?: (columnName: string) => void;
  onCustomColumnRename?: (oldName: string, newName: string) => void;
  onCustomColumnDelete?: (columnName: string) => void;
  onCustomCellChange?: (filename: string, columnName: string, value: string) => void;
  customColumns?: Record<string, Record<string, unknown>>;
  selectedCycles?: Record<string, number[]>;
  onCyclesChange?: (filename: string, cycles: number[]) => void;
}

export function FileTable({
  files,
  selectedFiles,
  onSelectionChange,
  onLabelChange,
  onDeleteSelected,
  onUpload,
  onCustomColumnAdd,
  onCustomColumnRename,
  onCustomColumnDelete,
  onCustomCellChange,
  customColumns = {},
  selectedCycles = {},
  onCyclesChange,
}: FileTableProps) {
  const [showExtendedColumns, setShowExtendedColumns] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Get all custom column names
  const customColumnNames = Object.keys(
    Object.values(customColumns).reduce<Record<string, unknown>>(
      (acc, cols) => ({ ...acc, ...cols }),
      {}
    )
  );

  // Get all analysis column names from all files
  const analysisColumnNames = useMemo(() => {
    const names = new Set<string>();
    files.forEach((f) => {
      if (f.analysis) {
        Object.keys(f.analysis).forEach((key) => names.add(key));
      }
    });
    return Array.from(names);
  }, [files]);

  // Check if any file has cycles (to show the column)
  const hasCycleFiles = files.some((f) => f.cycles && f.cycles.length > 0);

  // Paginated files
  const paginatedFiles = useMemo(() => {
    if (rowsPerPage === -1) return files; // Show all
    const start = page * rowsPerPage;
    return files.slice(start, start + rowsPerPage);
  }, [files, page, rowsPerPage]);

  // Reset page when files change significantly
  const maxPage = rowsPerPage === -1 ? 0 : Math.max(0, Math.ceil(files.length / rowsPerPage) - 1);
  if (page > maxPage) {
    setPage(maxPage);
  }

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    setRowsPerPage(value);
    setPage(0);
  };

  const allSelected = files.length > 0 && selectedFiles.length === files.length;
  const someSelected = selectedFiles.length > 0 && selectedFiles.length < files.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(files.map((f) => f.filename));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (filename: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedFiles, filename]);
    } else {
      onSelectionChange(selectedFiles.filter((f) => f !== filename));
    }
  };

  return (
    <Box>
      <FileTableToolbar
        showExtendedColumns={showExtendedColumns}
        onToggleExtendedColumns={() => setShowExtendedColumns(!showExtendedColumns)}
        selectedCount={selectedFiles.length}
        onDeleteSelected={() => onDeleteSelected(selectedFiles)}
        onUpload={onUpload}
        onAddColumn={onCustomColumnAdd}
      />

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <FileTableHeader
            allSelected={allSelected}
            someSelected={someSelected}
            onSelectAll={handleSelectAll}
            showCyclesColumn={hasCycleFiles}
            showExtendedColumns={showExtendedColumns}
            analysisColumnNames={analysisColumnNames}
            customColumnNames={customColumnNames}
            onCustomColumnRename={onCustomColumnRename || (() => {})}
            onCustomColumnDelete={onCustomColumnDelete || (() => {})}
          />
          <TableBody>
            {paginatedFiles.map((file) => (
              <FileRow
                key={file.filename}
                file={file}
                isSelected={selectedFiles.includes(file.filename)}
                onSelect={(checked) => handleSelectOne(file.filename, checked)}
                onLabelChange={(newLabel) => onLabelChange(file.filename, newLabel)}
                showCyclesColumn={hasCycleFiles}
                selectedCycles={selectedCycles[file.filename] || file.cycles || []}
                onCyclesChange={(cycles) => onCyclesChange?.(file.filename, cycles)}
                showExtendedColumns={showExtendedColumns}
                analysisColumnNames={analysisColumnNames}
                customColumnNames={customColumnNames}
                customColumnValues={customColumns[file.filename] || {}}
                onCustomCellChange={(col, value) => onCustomCellChange?.(file.filename, col, value)}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {files.length > 10 && (
        <TablePagination
          component="div"
          count={files.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50, { value: -1, label: 'All' }]}
          showFirstButton
          showLastButton
        />
      )}
    </Box>
  );
}
