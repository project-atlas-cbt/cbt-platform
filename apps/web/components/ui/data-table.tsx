'use client';

import { useRef, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

export interface DataTableColumn<TRow> {
  id: string;
  header: string;
  cell: (row: TRow) => ReactNode;
  /** Doctrine §7: text left, numbers right. */
  align?: 'left' | 'right';
  sortable?: boolean;
}

export interface DataTableSort {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface DataTableProps<TRow> {
  columns: DataTableColumn<TRow>[];
  rows: TRow[];
  getRowId: (row: TRow) => string;
  /**
   * Sort/pagination state is always **caller-owned** — this component
   * never sorts or slices `rows` itself. That's what makes it
   * server-side-pagination-ready (doctrine §7: "server-side pagination/
   * filter/sort for anything that can reach real-school scale") without
   * F0 having to invent the eventual real data-fetching layer: F7 and
   * later phases pass already-sorted, already-paginated `rows` and wire
   * these callbacks to their own query.
   */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  isLoading?: boolean;
  /** Shown instead of the table body when `rows` is empty and not loading. */
  emptyState?: ReactNode;
  caption?: string;
}

function nextSort(
  current: DataTableSort | null | undefined,
  columnId: string,
): DataTableSort | null {
  if (!current || current.columnId !== columnId) return { columnId, direction: 'asc' };
  if (current.direction === 'asc') return { columnId, direction: 'desc' };
  return null;
}

export function DataTable<TRow>({
  columns,
  rows,
  getRowId,
  sort,
  onSortChange,
  page,
  pageCount,
  onPageChange,
  isLoading = false,
  emptyState,
  caption,
}: DataTableProps<TRow>) {
  const showEmpty = !isLoading && rows.length === 0;
  const container = useRef<HTMLDivElement>(null);

  // Previous/Next can be pressed from anywhere in a long page now, so a new
  // page is brought to its first row rather than opening mid-list.
  function goToPage(next: number) {
    onPageChange?.(next);
    const element = container.current;
    if (!element) return;
    const headerHeight = parseFloat(getComputedStyle(element).getPropertyValue('--shell-top')) || 0;
    if (element.getBoundingClientRect().top < headerHeight) {
      element.scrollIntoView({ block: 'start' });
    }
  }

  return (
    <div ref={container} className="scroll-mt-[calc(var(--shell-top,0px)+1rem)] space-y-3">
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.id}
                className={column.align === 'right' ? 'text-right' : undefined}
              >
                {column.sortable && onSortChange ? (
                  <button
                    type="button"
                    onClick={() => onSortChange(nextSort(sort, column.id))}
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary',
                      column.align === 'right' ? 'flex-row-reverse' : undefined,
                    )}
                  >
                    {column.header}
                    {sort?.columnId === column.id ? (
                      sort.direction === 'asc' ? (
                        <ArrowUp className="size-3.5" aria-hidden />
                      ) : (
                        <ArrowDown className="size-3.5" aria-hidden />
                      )
                    ) : (
                      <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                    )}
                  </button>
                ) : (
                  column.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? // Skeleton placeholder rows have no real identity, so the
              // array index is a legitimate key here.
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={`skeleton-row-${rowIndex}`}>
                  {columns.map((column) => (
                    <TableCell key={column.id}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map((row) => (
                <TableRow key={getRowId(row)}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={column.align === 'right' ? 'text-right' : undefined}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>

      {showEmpty
        ? (emptyState ?? <EmptyState title="No data" description="There is nothing to show yet." />)
        : null}

      {!isLoading && !showEmpty && pageCount && pageCount > 1 && onPageChange ? (
        // Sticky to the bottom of the window while the table is in view, so
        // Previous/Next never need a scroll past every row to reach.
        <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between border-t border-border bg-surface px-1 py-2 text-sm text-text-secondary">
          <span>
            Page {page ?? 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={(page ?? 1) <= 1}
              onClick={() => goToPage((page ?? 1) - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={(page ?? 1) >= pageCount}
              onClick={() => goToPage((page ?? 1) + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
