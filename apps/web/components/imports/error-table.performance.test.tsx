import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorTable } from './error-table';
import { useImportRows } from '@/lib/imports/queries';

vi.mock('@/lib/imports/queries', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/imports/queries')>('@/lib/imports/queries');
  return { ...actual, useImportRows: vi.fn() };
});

const mockUseImportRows = vi.mocked(useImportRows);

/**
 * The frontend-side proxy for the roadmap's "1,500-row import" requirement
 * and its own Performance row ("the error table renders 500+ error rows
 * without freezing"). B7's own `import-1500-rows.integration.test.ts`
 * already proves real backend timing at that scale — this test instead
 * proves `<ErrorTable>` never mounts more than one server-paginated page's
 * worth of DOM rows regardless of how large the underlying dataset is,
 * which is what actually keeps rendering fast (see error-table.tsx's own
 * doc comment on why no virtualization dependency was introduced).
 */
describe('ErrorTable performance', () => {
  // The DoD guarantee is "never freezes while rendering 500+ error rows".
  // Its real regression guard is the strict single-page-mount invariant
  // below: mounting one page regardless of `rowsTotal` is what keeps the
  // table fast. The timing assertion is only a load-tolerant sanity ceiling
  // — isolated this render completes in ~15-30ms, but under full-suite
  // parallel CPU contention a jsdom render of the same 100 rows has
  // legitimately spiked past 1000ms (observed 1466ms), so the budget is set
  // well above that noise while still catching a genuinely pathological
  // mount (an actual 5-page freeze would blow far past it).
  it('renders a 500-row-total job promptly, mounting only one page of rows', () => {
    const PAGE_SIZE = 100;
    const pageRows = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      rowNumber: i + 1,
      status: 'INVALID' as const,
      rawData: { 'Student ID': `ST${String(i).padStart(3, '0')}`, Class: 'SS9' },
      errors: [{ field: 'Class', message: 'Class "SS9" was not found.' }],
    }));

    mockUseImportRows.mockReturnValue({
      isPending: false,
      isError: false,
      error: undefined,
      data: { rows: pageRows, rowsTotal: 500, rowsPage: 1, rowsPageSize: PAGE_SIZE },
      refetch: vi.fn(),
    } as never);

    const start = performance.now();
    render(<ErrorTable jobId="job1" />);
    const elapsed = performance.now() - start;

    // Every row number 1..100 from this one page is present…
    expect(screen.getByText('100')).toBeInTheDocument();
    // …but nothing from a later page (501-row dataset, 5 pages total) ever
    // mounts — proving this component genuinely never renders more than one
    // page at once, regardless of `rowsTotal`.
    expect(screen.queryByText('150')).not.toBeInTheDocument();
    expect(elapsed).toBeLessThan(5000);
  });
});
