import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorTable } from './error-table';
import { useImportRows } from '@/lib/imports/queries';
import { NetworkError } from '@/lib/api';

vi.mock('@/lib/imports/queries', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/imports/queries')>('@/lib/imports/queries');
  return { ...actual, useImportRows: vi.fn() };
});

const mockUseImportRows = vi.mocked(useImportRows);

function result(
  rows: unknown[],
  overrides: Partial<{ isPending: boolean; isError: boolean; rowsTotal: number }> = {},
) {
  return {
    isPending: false,
    isError: false,
    error: overrides.isError ? new NetworkError() : undefined,
    data: {
      rows,
      rowsTotal: overrides.rowsTotal ?? rows.length,
      rowsPage: 1,
      rowsPageSize: 100,
    },
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('ErrorTable', () => {
  beforeEach(() => {
    mockUseImportRows.mockReset();
  });

  it('shows an empty state when no rows need attention', () => {
    mockUseImportRows.mockReturnValue(result([]) as never);
    render(<ErrorTable jobId="job1" />);
    expect(screen.getByText('No rows need attention')).toBeInTheDocument();
  });

  it('shows an error state on failure', () => {
    mockUseImportRows.mockReturnValue(result([], { isError: true }) as never);
    render(<ErrorTable jobId="job1" />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders the row number, field, and reason for each invalid row (DoD item 4)', () => {
    mockUseImportRows.mockReturnValue(
      result([
        {
          rowNumber: 12,
          status: 'INVALID',
          rawData: { 'Student ID': 'ST099', Class: 'SS9' },
          errors: [{ field: 'Class', message: 'Class "SS9" was not found.' }],
        },
      ]) as never,
    );
    render(<ErrorTable jobId="job1" />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Class')).toBeInTheDocument();
    expect(screen.getByText('Class "SS9" was not found.')).toBeInTheDocument();
  });

  it('requests the next page from the server on Next (performance: never renders more than one page)', async () => {
    const onePage = Array.from({ length: 100 }, (_, i) => ({
      rowNumber: i + 1,
      status: 'INVALID',
      rawData: {},
      errors: [{ field: 'Class', message: 'Not found.' }],
    }));
    mockUseImportRows.mockReturnValue(result(onePage, { rowsTotal: 250 }) as never);
    render(<ErrorTable jobId="job1" />);
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(mockUseImportRows).toHaveBeenLastCalledWith('job1', {
      page: 2,
      pageSize: 100,
      status: 'INVALID',
    });
  });
});
