'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Real `<table>` semantics throughout (doctrine §11: "critical for the
 * large student/result tables this product is full of") — these are the
 * primitives `DataTable` (below) composes; use them directly for a
 * hand-built table shape that doesn't fit the generic sort/paginate case.
 */
export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /**
   * Keep the column headings in view while the page scrolls past a long
   * table. A table only scrolls sideways when it is wider than its box, and
   * a sideways-scrolling box would trap the sticky heading inside it, so the
   * box clips instead whenever the table fits (the usual case at lab
   * resolution) and scrolls only when it doesn't.
   */
  stickyHeader?: boolean;
}

function insideScrollingPanel(element: HTMLElement): boolean {
  for (
    let node = element.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return true;
  }
  return false;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, stickyHeader = false, ...props }, ref) => {
    const box = useRef<HTMLDivElement>(null);
    const table = useRef<HTMLTableElement | null>(null);
    const [sticky, setSticky] = useState<{ fits: boolean; top: string } | null>(null);

    useEffect(() => {
      if (!stickyHeader) return;
      const boxElement = box.current;
      const tableElement = table.current;
      if (!boxElement || !tableElement) return;
      const measure = () =>
        setSticky({
          fits: tableElement.scrollWidth <= boxElement.clientWidth + 1,
          // Under the app's fixed header when the page itself scrolls; at the
          // top of a scrolling panel (a dialog, a side sheet) otherwise.
          top: insideScrollingPanel(boxElement) ? '0px' : 'var(--shell-top, 0px)',
        });
      measure();
      if (typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver(measure);
      observer.observe(boxElement);
      observer.observe(tableElement);
      return () => observer.disconnect();
    }, [stickyHeader]);

    return (
      <div
        ref={box}
        className={cn(
          'w-full rounded-md border border-border',
          sticky?.fits ? 'overflow-x-clip' : 'overflow-x-auto',
        )}
        // A box that scrolls sideways is its own scroll container, so the
        // heading can only stick to its top; the offset would float it mid-table.
        style={sticky?.fits ? ({ '--table-sticky-top': sticky.top } as CSSProperties) : undefined}
      >
        <table
          ref={(element) => {
            table.current = element;
            if (typeof ref === 'function') ref(element);
            else if (ref) ref.current = element;
          }}
          className={cn('w-full caption-bottom text-sm', className)}
          {...props}
        />
      </div>
    );
  },
);
Table.displayName = 'Table';

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  // Doctrine §7 ("Tables"): sticky headers on long tables. `--table-sticky-top`
  // is set by a `stickyHeader` table; others stick to their own box's top.
  <thead
    ref={ref}
    className={cn(
      'sticky top-(--table-sticky-top,0px) z-10 bg-surface-muted shadow-[0_1px_0_var(--color-border)]',
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('divide-y divide-border', className)} {...props} />
));
TableBody.displayName = 'TableBody';

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn('transition-colors hover:bg-surface-muted/60', className)}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 px-3 text-left align-middle text-xs font-medium text-text-secondary',
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('px-3 py-2 align-middle text-text-primary', className)}
      {...props}
    />
  ),
);
TableCell.displayName = 'TableCell';

export const TableCaption = forwardRef<
  HTMLTableCaptionElement,
  HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn('mt-4 text-sm text-text-muted', className)} {...props} />
));
TableCaption.displayName = 'TableCaption';
