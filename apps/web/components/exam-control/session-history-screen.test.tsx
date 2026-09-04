import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useExam } from '@/lib/exams/queries';
import { useExamControl } from '@/lib/exam-control/queries';
import { SessionHistoryScreen } from './session-history-screen';

vi.mock('@/lib/exams/queries', () => ({ useExam: vi.fn() }));
vi.mock('@/lib/exam-control/queries', () => ({ useExamControl: vi.fn() }));
const mockUseExam = vi.mocked(useExam);
const mockUseExamControl = vi.mocked(useExamControl);

const EXAM = { id: 'e1', title: 'First Term Examination' };

describe('SessionHistoryScreen', () => {
  it('renders the full session history — reads the already-fetched control-center cache, no new query shape assumed', () => {
    mockUseExam.mockReturnValue({
      data: EXAM,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseExamControl.mockReturnValue({
      data: {
        sessions: [
          {
            id: 's1',
            sessionType: 'STANDARD',
            status: 'COMPLETED',
            openedAt: '2026-01-01T09:00:00Z',
            openedByName: 'Ade Ola',
            closedAt: '2026-01-01T10:00:00Z',
            closedByName: 'Ade Ola',
            reopenedAt: null,
            completedAt: '2026-01-01T10:05:00Z',
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<SessionHistoryScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByText('STANDARD')).toBeInTheDocument();
    expect(screen.getAllByText('Ade Ola')).toHaveLength(2);
  });

  it('shows an empty state with no sessions', () => {
    mockUseExam.mockReturnValue({
      data: EXAM,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseExamControl.mockReturnValue({
      data: { sessions: [] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<SessionHistoryScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    mockUseExam.mockReturnValue({ data: undefined, isPending: true, isError: false } as never);
    mockUseExamControl.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as never);
    render(<SessionHistoryScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry', () => {
    const refetch = vi.fn();
    mockUseExam.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    mockUseExamControl.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
    } as never);
    render(<SessionHistoryScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});
