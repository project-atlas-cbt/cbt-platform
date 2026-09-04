import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useExamsPaginated } from '@/lib/exams/queries';
import { ActiveExamsScreen } from './active-exams-screen';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/exams/queries', () => ({ useExamsPaginated: vi.fn() }));
const mockUseExamsPaginated = vi.mocked(useExamsPaginated);

const EXAM = {
  id: 'e1',
  title: 'First Term Examination',
  examType: 'Examination',
  status: 'OPEN',
  subjectName: 'Mathematics',
  createdByName: 'Ade Ola',
  classes: [{ className: 'SS2A' }],
};

describe('ActiveExamsScreen', () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it('filters to only READY/OPEN/CLOSED via the status filter (no All-statuses list)', () => {
    mockUseExamsPaginated.mockReturnValue({
      data: { exams: [EXAM], total: 1 },
      isPending: false,
      isError: false,
    } as never);
    render(<ActiveExamsScreen basePath="/teacher/exam-control" scope="own" />);
    expect(screen.getByRole('tab', { name: /ready/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^open$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^closed$/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /completed/i })).not.toBeInTheDocument();
  });

  it('links a row into the real Control Center', () => {
    mockUseExamsPaginated.mockReturnValue({
      data: { exams: [EXAM], total: 1 },
      isPending: false,
      isError: false,
    } as never);
    render(<ActiveExamsScreen basePath="/teacher/exam-control" scope="own" />);
    expect(screen.getByRole('link', { name: 'First Term Examination' })).toHaveAttribute(
      'href',
      '/teacher/exam-control/e1',
    );
  });

  it('shows a Teacher column only in oversight scope', () => {
    mockUseExamsPaginated.mockReturnValue({
      data: { exams: [EXAM], total: 1 },
      isPending: false,
      isError: false,
    } as never);
    const { rerender } = render(<ActiveExamsScreen basePath="/teacher/exam-control" scope="own" />);
    expect(screen.queryByText('Ade Ola')).not.toBeInTheDocument();
    rerender(<ActiveExamsScreen basePath="/school/exam-operations" scope="oversight" />);
    expect(screen.getByText('Ade Ola')).toBeInTheDocument();
  });

  it('shows an empty state with no controllable exams', () => {
    mockUseExamsPaginated.mockReturnValue({
      data: { exams: [], total: 0 },
      isPending: false,
      isError: false,
    } as never);
    render(<ActiveExamsScreen basePath="/teacher/exam-control" scope="own" />);
    expect(screen.getByText(/no controllable exams/i)).toBeInTheDocument();
  });

  it('shows an error state with retry', () => {
    const refetch = vi.fn();
    mockUseExamsPaginated.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<ActiveExamsScreen basePath="/teacher/exam-control" scope="own" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});
