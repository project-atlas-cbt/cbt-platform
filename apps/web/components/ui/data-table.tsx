'use client';

import { useRef, type MouseEvent, type ReactNode } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { PAGE_SIZE_OPTIONS } from '@/lib/query/page-size';
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
  /** With `pageSize`, shows "Showing 26–50 of 312" beside the page controls. */
  total?: number | undefined;
  pageSize?: number | undefined;
  /** Offers 25/50/100 rows per page (`PAGE_SIZE_OPTIONS`); the caller resets to page 1. */
  onPageSizeChange?: ((pageSize: number) => void) | undefined;
  /**
   * Where a row leads. A click anywhere on the row that isn't on its own
   * control opens it (Ctrl/Cmd-click in a new tab). The row's own link
   * stays the keyboard and screen-reader route, so this adds no tab stop.
   */
  getRowHref?: ((row: TRow) => string) | undefined;
  isLoading?: boolean;
  /** Shown instead of the table body when `rows` is empty and not loading. */
  emptyState?: ReactNode;
  caption?: string;
}

const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="button"], [role="checkbox"], [role="combobox"], [role="menuitem"], [role="link"]';

/**
 * The page controls show when there is more than one page, or when a
 * rows-per-page choice could still change that (so a reader who picked 100
 * can get back to 25).
 */
function showPager(
  pageCount: number | undefined,
  total: number | undefined,
  onPageSizeChange: ((pageSize: number) => void) | undefined,
): boolean {
  if (pageCount !== undefined && pageCount > 1) return true;
  return Boolean(onPageSizeChange && total !== undefined && total > PAGE_SIZE_OPTIONS[0]);
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
  total,
  pageSize,
  onPageSizeChange,
  getRowHref,
  isLoading = false,
  emptyState,
  caption,
}: DataTableProps<TRow>) {
  const showEmpty = !isLoading && rows.length === 0;
  const container = useRef<HTMLDivElement>(null);
  const currentPage = page ?? 1;

  function openRow(event: MouseEvent<HTMLTableRowElement>, href: string) {
    if (event.button !== 0) return;
    // A click on the row's own links, buttons, checkboxes or menus does that
    // control's job; so does selecting text.
    const control = (event.target as Element).closest(INTERACTIVE);
    if (control && event.currentTarget.contains(control)) return;
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey) {
      window.open(href, '_blank', 'noopener');
      return;
    }
    // Follow the row's own link to the same place where it has one, so the
    // app's client-side navigation handles it; otherwise load the page.
    const link = Array.from(event.currentTarget.querySelectorAll('a')).find(
      (anchor) => anchor.getAttribute('href') === href,
    );
    if (link) link.click();
    else window.location.assign(href);
  }

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
      <Table stickyHeader>
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
            : rows.map((row) => {
                const href = getRowHref?.(row);
                return (
                  <TableRow
                    key={getRowId(row)}
                    {...(href
                      ? {
                          onClick: (event: MouseEvent<HTMLTableRowElement>) => openRow(event, href),
                          className: 'cursor-pointer',
                        }
                      : {})}
                  >
                    {columns.map((column) => (
                      <TableCell
                        key={column.id}
                        className={column.align === 'right' ? 'text-right' : undefined}
                      >
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
        </TableBody>
      </Table>

      {showEmpty
        ? (emptyState ?? <EmptyState title="No data" description="There is nothing to show yet." />)
        : null}

      {!isLoading && !showEmpty && onPageChange && showPager(pageCount, total, onPageSizeChange) ? (
        // Sticky to the bottom of the window while the table is in view, so
        // Previous/Next never need a scroll past every row to reach.
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-surface px-1 py-2 text-sm text-text-secondary">
          <span aria-live="polite">
            {total !== undefined && pageSize
              ? `Showing ${Math.min((currentPage - 1) * pageSize + 1, total)}–${Math.min(currentPage * pageSize, total)} of ${total}`
              : `Page ${currentPage} of ${pageCount ?? 1}`}
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {onPageSizeChange && pageSize ? (
              <label className="hidden items-center gap-2 sm:flex">
                <span>Rows per page</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => onPageSizeChange(Number(value))}
                >
                  <SelectTrigger className="h-8 w-[4.5rem]" aria-label="Rows per page">
                    {pageSize}
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            {total !== undefined && pageSize ? (
              <span className="hidden sm:inline">
                Page {currentPage} of {pageCount ?? 1}
              </span>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => goToPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= (pageCount ?? 1)}
                onClick={() => goToPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
