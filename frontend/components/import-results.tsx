'use client';

import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnDef,
  ColumnResizeMode,
  ColumnSizingState,
} from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Download,
  Maximize2,
  Search,
  Phone,
  Mail,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { CellDetailModal } from '@/components/cell-detail-modal';
import { CrmRecord, CrmStatus } from '@/types';

// ===== Interfaces =====

interface ImportResultsProps {
  records: CrmRecord[];
  summary: {
    totalProcessed: number;
  };
}

// ===== Status Badge Variants =====

const statusVariantMap: Record<CrmStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  GOOD_LEAD_FOLLOW_UP: 'success',
  DID_NOT_CONNECT: 'warning',
  BAD_LEAD: 'destructive',
  SALE_DONE: 'default',
};

const statusDisplayMap: Record<CrmStatus, string> = {
  GOOD_LEAD_FOLLOW_UP: 'Good Lead - Follow Up',
  DID_NOT_CONNECT: 'Did Not Connect',
  BAD_LEAD: 'Bad Lead',
  SALE_DONE: 'Sale Done',
};

// ===== Main Component =====

export function ImportResults({ records, summary }: ImportResultsProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');
  const [isExporting, setIsExporting] = React.useState(false);
  const [detailModal, setDetailModal] = React.useState<{
    value: string;
    columnName: string;
    rowIndex: number;
  } | null>(null);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filteredRecords = React.useMemo(() => {
    if (!debouncedSearchTerm.trim()) return records;
    const term = debouncedSearchTerm.toLowerCase();
    return records.filter((record) =>
      Object.values(record).some(
        (val) => val && val.toLowerCase().includes(term)
      )
    );
  }, [records, debouncedSearchTerm]);

  const columns = React.useMemo<ColumnDef<CrmRecord>[]>(() => {
    const columnHelper = createColumnHelper<CrmRecord>();

    return [
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
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => {
          const value = info.getValue();
          return value ? (
            <span className="font-medium">{value}</span>
          ) : (
            <span className="text-muted-foreground/50">&mdash;</span>
          );
        },
        size: 150,
        minSize: 100,
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => {
          const email = info.getValue();
          return email ? (
            <div className="flex items-center gap-1.5">
              <Mail className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <a href={`mailto:${email}`} className="text-primary hover:underline truncate">
                {email}
              </a>
            </div>
          ) : (
            <span className="text-muted-foreground/50">&mdash;</span>
          );
        },
        size: 200,
        minSize: 120,
      }),
      columnHelper.accessor('mobile_without_country_code', {
        header: 'Phone',
        cell: (info) => {
          const phone = info.getValue();
          const countryCode = info.row.original.country_code;
          if (!phone) return <span className="text-muted-foreground/50">&mdash;</span>;
          return (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <span>
                {countryCode && (
                  <span className="text-muted-foreground/60">+{countryCode} </span>
                )}
                {phone}
              </span>
            </div>
          );
        },
        size: 160,
        minSize: 100,
      }),
      columnHelper.accessor('company', {
        header: 'Company',
        cell: (info) => {
          const value = info.getValue();
          return value ? (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <span className="truncate">{value}</span>
            </div>
          ) : (
            <span className="text-muted-foreground/50">&mdash;</span>
          );
        },
        size: 150,
        minSize: 100,
      }),
      columnHelper.accessor('city', {
        header: 'City',
        cell: (info) => info.getValue() || <span className="text-muted-foreground/50">&mdash;</span>,
        size: 120,
        minSize: 80,
      }),
      columnHelper.accessor('country', {
        header: 'Country',
        cell: (info) => info.getValue() || <span className="text-muted-foreground/50">&mdash;</span>,
        size: 120,
        minSize: 80,
      }),
      columnHelper.accessor((row) => row.crm_status, {
        id: 'crm_status',
        header: 'Status',
        cell: (info) => {
          const status = info.getValue() as CrmStatus;
          return status ? (
            <Badge variant={statusVariantMap[status] || 'outline'} className="capitalize whitespace-nowrap">
              {statusDisplayMap[status] || status.replace(/_/g, ' ')}
            </Badge>
          ) : (
            <span className="text-muted-foreground/50">&mdash;</span>
          );
        },
        size: 120,
        minSize: 80,
      }),
      columnHelper.accessor('lead_owner', {
        header: 'Lead Owner',
        cell: (info) => info.getValue() || <span className="text-muted-foreground/50">&mdash;</span>,
        size: 130,
        minSize: 80,
      }),
      columnHelper.accessor('crm_note', {
        header: 'Notes',
        cell: (info) => {
          const note = info.getValue();
          const rowIndex = info.row.index + 1;
          if (!note) return <span className="text-muted-foreground/50">&mdash;</span>;
          return (
            <div className="group flex items-center gap-1 max-w-[200px]">
              <span className="text-xs text-muted-foreground line-clamp-2 block">
                {note}
              </span>
              {note.length > 60 && (
                <button
                  onClick={() =>
                    setDetailModal({
                      value: note,
                      columnName: 'crm_note',
                      rowIndex,
                    })
                  }
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-muted-foreground"
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        },
        size: 200,
        minSize: 100,
      }),
    ] as ColumnDef<CrmRecord>[];
  }, []);

  const table = useReactTable({
    data: filteredRecords,
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

  /**
   * Sanitize a cell value to prevent CSV injection.
   * Cells starting with =, +, -, @ or tab are prefixed with a single quote
   * to prevent formula execution in Excel/Google Sheets.
   */
  const sanitizeCsvCell = (value: string): string => {
    if (/^[=+\-@\t]/.test(value)) {
      return `"'${value.replace(/"/g, '""')}"`;
    }
    return `"${value.replace(/"/g, '""')}"`;
  };

  const exportCsv = () => {
    setIsExporting(true);

    // Use setTimeout to allow the UI to update before the potentially
    // heavy synchronous work below
    setTimeout(() => {
      try {
        const headers = [
          'created_at', 'name', 'email', 'country_code', 'mobile_without_country_code',
          'company', 'city', 'state', 'country', 'lead_owner', 'crm_status',
          'crm_note', 'data_source', 'possession_time', 'description',
        ];
        const csvRows = [
          headers.join(','),
          ...records.map((record) =>
            headers.map((h) => {
              const val = record[h as keyof CrmRecord] || '';
              return sanitizeCsvCell(val);
            }).join(',')
          ),
        ];
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `imported-crm-records-${timestamp}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        setIsExporting(false);
      }
    }, 50);
  };

  const hasSearch = filteredRecords.length < records.length;

  return (
    <>
      <Card className="animate-fade-in">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-3 sm:space-y-0 pb-4 gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">CRM Records</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {hasSearch ? (
                  <>
                    Showing {filteredRecords.length.toLocaleString()} of{' '}
                    {records.length.toLocaleString()} records
                  </>
                ) : (
                  <>{records.length.toLocaleString()} records processed by AI</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input
                type="text"
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  table.setPageIndex(0);
                }}
                aria-label="Search records"
                className="pl-8 w-full sm:w-[200px]"
              />
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={isExporting}>
              {isExporting ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="rounded-lg border">
            <ScrollArea className="w-full">
              <div
                className="min-w-[800px]"
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
                    {table.getRowModel().rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={columns.length}
                          className="p-8 text-center text-muted-foreground"
                        >
                          {searchTerm
                            ? `No records match "${searchTerm}"`
                            : 'No records to display'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Pagination */}
            {table.getPageCount() > 1 && (
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
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cell Detail Modal */}
      {detailModal && (
        <CellDetailModal
          value={detailModal.value}
          columnName={detailModal.columnName}
          rowIndex={detailModal.rowIndex}
          label="Record #"
          onClose={() => setDetailModal(null)}
        />
      )}
    </>
  );
}
