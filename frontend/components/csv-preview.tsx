'use client';

import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  ColumnDef,
  SortingState,
  ColumnResizeMode,
  ColumnSizingState,
} from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  Table,
  AlertTriangle,
  Info,
  Maximize2,
  Columns3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { CellDetailModal } from '@/components/cell-detail-modal';
import type { ValidationWarning } from '@/types';

// ===== Interfaces =====

interface CsvPreviewProps {
  headers: string[];
  rows: Record<string, string | undefined>[];
  totalRows: number;
  fileName: string;
  isLoading?: boolean;
  warnings?: ValidationWarning[];
  onProcessWithAi?: () => void;
  isProcessing?: boolean;
}

// ===== Loading Skeleton =====

function PreviewSkeleton() {
  return (
    <Card className="animate-fade-in">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-48 rounded bg-muted animate-pulse" />
            <div className="h-3 w-64 rounded bg-muted/60 animate-pulse" />
          </div>
        </div>
        <div className="h-5 w-28 rounded bg-muted animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Table header skeleton */}
          <div className="flex gap-4 px-4 py-3">
            <div className="h-4 w-8 rounded bg-muted/60 animate-pulse" />
            <div className="h-4 w-32 rounded bg-muted/60 animate-pulse" />
            <div className="h-4 w-48 rounded bg-muted/60 animate-pulse" />
            <div className="h-4 w-24 rounded bg-muted/60 animate-pulse" />
            <div className="h-4 w-36 rounded bg-muted/60 animate-pulse" />
          </div>
          {/* Row skeletons */}
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 border-t px-4 py-4">
              <div className="h-3 w-8 rounded bg-muted/30 animate-pulse" />
              <div className="h-3 w-32 rounded bg-muted/30 animate-pulse" />
              <div className="h-3 w-48 rounded bg-muted/30 animate-pulse" />
              <div className="h-3 w-24 rounded bg-muted/30 animate-pulse" />
              <div className="h-3 w-36 rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Empty State =====

function EmptyState() {
  return (
    <Card className="animate-fade-in">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Table className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-lg font-medium text-muted-foreground">No data to preview</p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          The uploaded CSV file contains no data rows.
        </p>
      </CardContent>
    </Card>
  );
}

// ===== Main Component =====

type CsvRow = Record<string, string | undefined>;

export function CsvPreview({
  headers,
  rows,
  totalRows,
  fileName,
  isLoading = false,
  warnings,
  onProcessWithAi,
  isProcessing,
}: CsvPreviewProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [detailModal, setDetailModal] = React.useState<{
    value: string;
    columnName: string;
    rowIndex: number;
  } | null>(null);

  // Show skeleton while loading
  if (isLoading) return <PreviewSkeleton />;

  // Show empty state if no rows
  if (rows.length === 0) {
    return <EmptyState />;
  }

  const columns = React.useMemo<ColumnDef<CsvRow, any>[]>(() => {
    const columnHelper = createColumnHelper<CsvRow>();

    // Row index column
    const cols: ColumnDef<CsvRow, any>[] = [
      columnHelper.display({
        id: 'rowIndex',
        header: () => <span className="text-xs font-normal text-muted-foreground">#</span>,
        cell: (info) => (
          <span className="text-xs text-muted-foreground/60 tabular-nums">
            {info.row.index + 1}
          </span>
        ),
        size: 50,
        minSize: 40,
        maxSize: 60,
        enableResizing: false,
        enableSorting: false,
      }),
    ];

    // Data columns
    headers.forEach((header) => {
      cols.push(
        columnHelper.accessor(header, {
          header: () => (
            <span
              className="block truncate max-w-[200px]"
              title={header}
            >
              {header}
            </span>
          ),
          cell: (info) => {
            const value = info.getValue();
            const rowIndex = info.row.index + 1;
            return (
              <div className="group flex items-center gap-1 max-w-[250px]">
                <span
                  className={cn(
                    'truncate text-sm',
                    value ? '' : 'text-muted-foreground/40 italic'
                  )}
                  title={value}
                >
                  {value || '—'}
                </span>
                {value && value.length > 30 && (
                  <button
                    onClick={() =>
                      setDetailModal({
                        value,
                        columnName: header,
                        rowIndex,
                      })
                    }
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-muted-foreground"
                    title="View full cell content"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          },
          size: 150,
          minSize: 80,
          enableResizing: true,
          enableSorting: true,
        })
      );
    });

    return cols;
  }, [headers]);

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange' as ColumnResizeMode,
    enableColumnResizing: true,
    defaultColumn: {
      minSize: 60,
      maxSize: 400,
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const hasWarnings = warnings && warnings.length > 0;

  return (
    <>
      <Card className="animate-fade-in">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-lg bg-primary/10 p-2 shrink-0">
              <Table className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg truncate">{fileName}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {totalRows.toLocaleString()} row{totalRows !== 1 ? 's' : ''}
                </span>
                <span>&middot;</span>
                <span>{headers.length} column{headers.length !== 1 ? 's' : ''}</span>
                <span>&middot;</span>
                <span className="flex items-center gap-1">
                  <Columns3 className="h-3 w-3" />
                  Showing {Math.min(rows.length, totalRows).toLocaleString()} preview rows
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-xs whitespace-nowrap">
              {totalRows.toLocaleString()} rows
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Validation Warnings */}
          {hasWarnings && (
            <div className="rounded-xl border border-amber-200/50 bg-amber-50/50 dark:border-amber-800/30 dark:bg-amber-950/20 px-4 py-3 animate-fade-in">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {warnings.length} validation warning{warnings.length !== 1 ? 's' : ''}
                  </p>
                  <ul className="space-y-0.5">
                    {warnings.slice(0, 3).map((w, i) => (
                      <li
                        key={i}
                        className="text-xs text-amber-700 dark:text-amber-300/80"
                      >
                        {w.message}
                      </li>
                    ))}
                    {warnings.length > 3 && (
                      <li className="text-xs text-amber-600 dark:text-amber-400/60">
                        +{warnings.length - 3} more warning{warnings.length - 3 !== 1 ? 's' : ''}
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="rounded-lg border">
            <ScrollArea className="w-full">
              <div
                className="min-w-[500px]"
                style={{ width: table.getTotalSize() ? undefined : '100%' }}
              >
                <table
                  className="w-full caption-bottom text-sm"
                  style={{ width: table.getCenterTotalSize() }}
                >
                  <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            colSpan={header.colSpan}
                            style={{
                              width: header.getSize(),
                              position: 'relative',
                            }}
                            className={cn(
                              'sticky top-0 z-10 h-11 px-3 text-left align-middle font-medium text-muted-foreground bg-muted/50 backdrop-blur-sm border-b select-none',
                              header.column.getCanSort() &&
                                'cursor-pointer hover:bg-muted/80 transition-colors'
                            )}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <div className="flex items-center gap-1.5">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                              {header.column.getCanSort() && (
                                <span className="text-[10px] text-muted-foreground/40">
                                  {{
                                    asc: ' ▲',
                                    desc: ' ▼',
                                  }[header.column.getIsSorted() as string] ?? ''}
                                </span>
                              )}
                            </div>
                            {/* Column resize handle */}
                            {header.column.getCanResize() && (
                              <div
                                onMouseDown={header.getResizeHandler()}
                                onTouchStart={header.getResizeHandler()}
                                className={cn(
                                  'absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/50 transition-colors',
                                  header.column.getIsResizing() && 'bg-primary'
                                )}
                              />
                            )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row, rowIdx) => (
                      <tr
                        key={row.id}
                        className={cn(
                          'border-b transition-colors hover:bg-muted/30',
                          rowIdx % 2 === 1 && 'bg-muted/15'
                        )}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            style={{ width: cell.column.getSize() }}
                            className={cn(
                              'p-3 align-middle',
                              cell.column.columnDef.id === 'rowIndex' && 'w-[50px]'
                            )}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t px-4 py-3">
              <p className="text-sm text-muted-foreground order-2 sm:order-1">
                Page {table.getState().pagination.pageIndex + 1} of{' '}
                {table.getPageCount().toLocaleString()}
              </p>
              <div className="flex items-center gap-2 order-1 sm:order-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="h-8"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: table.getPageCount() }, (_, i) => i)
                    .slice(
                      Math.max(0, table.getState().pagination.pageIndex - 2),
                      Math.min(table.getPageCount(), table.getState().pagination.pageIndex + 3)
                    )
                    .map((page) => (
                      <Button
                        key={page}
                        variant={
                          page === table.getState().pagination.pageIndex
                            ? 'default'
                            : 'outline'
                        }
                        size="sm"
                        onClick={() => table.setPageIndex(page)}
                        className="h-8 w-8 p-0"
                      >
                        {page + 1}
                      </Button>
                    ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="h-8"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>

          {/* Process with AI Button */}
          {onProcessWithAi && (
            <div className="flex justify-center pt-2 animate-fade-in">
              <Button
                size="lg"
                onClick={onProcessWithAi}
                disabled={isProcessing}
                className="gap-2 text-base h-12 px-8 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
              >
                {isProcessing ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Info className="h-5 w-5" />
                    Process {totalRows.toLocaleString()} rows with AI
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cell Detail Modal */}
      {detailModal && (
        <CellDetailModal
          value={detailModal.value}
          columnName={detailModal.columnName}
          rowIndex={detailModal.rowIndex}
          onClose={() => setDetailModal(null)}
        />
      )}
    </>
  );
}
