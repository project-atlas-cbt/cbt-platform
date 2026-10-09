import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { useExamsPaginated } from '@/lib/exams/queries';
import { useExamResults } from '@/lib/results/staff-queries';
import { ClassExamsTable } from './class-exams-table';

let pathname = '/hod/academics/classes/c1';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/lib/exams/queries', () => ({ useExamsPaginated: vi.fn() }));
vi.mock('@/lib/results/staff-queries', () => ({ useExamResults: vi.fn() }));

const mockUseExamsPaginated = vi.mocked(useExamsPaginated);
const mockUseExamResults = vi.mocked(useExamResults);

function exam(id: string, title: string, status: string) {
  return {
    id,
    title,
    status,
    subjectName: 'Mathematics',
    termName: 'First Term',
    updatedAt: '2026-10-08T10:00:00Z',
  };
}

function summary(resultCount: number, pendingCount: number, absentCount: number) {
  return { resultCount, pendingCount, absentCount };
}

describe('ClassExamsTable', () => {
  beforeEach(() => {
    pathname = '/hod/academics/classes/c1';
    mockUseExamResults.mockReset();
  });

  it('asks the server for this class only, and leaves scope to the server', () => {
    mockUseExamsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { exams: [], total: 0 },
    } as never);
    mockUseExamResults.mockReturnValue({ isPending: false, data: undefined } as never);
    render(<ClassExamsTable classId="c1" />);
    expect(mockUseExamsPaginated).toHaveBeenCalledWith({ classId: 'c1', page: 1, pageSize: 25 });
    expect(screen.getByText('No exams for this class yet')).toBeInTheDocument();
  });

  it('shows sat and missed counts for this class, and links inside the current root', () => {
    mockUseExamsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        exams: [exam('e1', 'Maths CA 1', 'COMPLETED'), exam('e2', 'Maths exam', 'DRAFT')],
        total: 2,
      },
    } as never);
    mockUseExamResults.mockImplementation(
      (examId) =>
        ({
          isPending: false,
          data:
            examId === 'e1'
              ? {
                  summary: summary(50, 0, 6),
                  classSummaries: [
                    { classId: 'c1', className: 'SS2A', ...summary(28, 2, 3) },
                    { classId: 'c2', className: 'SS2B', ...summary(22, 0, 3) },
                  ],
                }
              : undefined,
        }) as never,
    );
    render(<ClassExamsTable classId="c1" />);

    const row = screen.getByRole('row', { name: /Maths CA 1/ });
    expect(within(row).getByText('30')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Maths CA 1' })).toHaveAttribute(
      'href',
      '/hod/exams/e1',
    );
    expect(within(row).getByRole('link', { name: 'View results' })).toHaveAttribute(
      'href',
      '/hod/results/e1?classId=c1',
    );

    // A draft has no sittings: no results request, no counts, no results link.
    const draft = screen.getByRole('row', { name: /Maths exam/ });
    expect(within(draft).queryByRole('link', { name: 'View results' })).toBeNull();
    expect(mockUseExamResults).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it('uses the whole-exam summary when the exam targets only this class', () => {
    pathname = '/school/academics/classes/c1';
    mockUseExamsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { exams: [exam('e1', 'Maths CA 1', 'CLOSED')], total: 1 },
    } as never);
    mockUseExamResults.mockReturnValue({
      isPending: false,
      data: { summary: summary(40, 1, 2), classSummaries: [] },
    } as never);
    render(<ClassExamsTable classId="c1" />);

    const row = screen.getByRole('row', { name: /Maths CA 1/ });
    expect(within(row).getByText('41')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'View results' })).toHaveAttribute(
      'href',
      '/school/results/e1?classId=c1',
    );
  });

  it('shows an error state with retry when the exam list fails', () => {
    mockUseExamsPaginated.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    render(<ClassExamsTable classId="c1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});
