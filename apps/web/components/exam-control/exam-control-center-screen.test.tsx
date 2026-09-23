import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHasPermission } from '@/lib/nav';
import { useExam } from '@/lib/exams/queries';
import { useExamControl, useExamParticipation } from '@/lib/exam-control/queries';
import {
  useOpenExamSession,
  useCloseExam,
  useReopenExam,
  useCloseExamSession,
  useReopenExamSession,
} from '@/lib/exam-control/mutations';
import { useExamControlStream } from '@/lib/exam-control/sse-client';
import { ExamControlCenterScreen } from './exam-control-center-screen';

vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/exams/queries', () => ({ useExam: vi.fn() }));
vi.mock('@/lib/exam-control/queries', () => ({
  useExamControl: vi.fn(),
  // `EndExaminationDialog` (always mounted, closed-by-default) calls this
  // unconditionally regardless of `open` — every hook call must resolve.
  useEligibleStudents: vi.fn(() => ({ data: undefined, isPending: true, isError: false })),
  // The `LiveAttemptsTable` (always mounted) owns the roster query.
  useExamParticipation: vi.fn(() => ({
    data: { examId: 'e1', students: [] },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })),
}));
vi.mock('@/lib/exam-control/mutations', () => ({
  useOpenExamSession: vi.fn(),
  useCloseExam: vi.fn(),
  useReopenExam: vi.fn(),
  useCloseExamSession: vi.fn(),
  useReopenExamSession: vi.fn(),
  // `EndExaminationDialog` (always mounted, closed-by-default) needs this.
  useCompleteExam: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock('@/lib/exam-control/sse-client', () => ({ useExamControlStream: vi.fn() }));
// Isolates this screen's own orchestration (button visibility, dialog
// wiring, connection-state disabling) from `SessionsTable`'s/
// `DelegatesSection`'s own already-covered internals.
vi.mock('./sessions-table', () => ({
  SessionsTable: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="sessions-table" data-disabled={String(Boolean(disabled))} />
  ),
}));
vi.mock('./delegates-section', () => ({
  DelegatesSection: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="delegates" data-disabled={String(Boolean(disabled))} />
  ),
}));

const mockUseHasPermission = vi.mocked(useHasPermission);
const mockUseExam = vi.mocked(useExam);
const mockUseExamControl = vi.mocked(useExamControl);
const mockUseExamParticipation = vi.mocked(useExamParticipation);
const mockUseExamControlStream = vi.mocked(useExamControlStream);
const mockUseOpenExamSession = vi.mocked(useOpenExamSession);
const mockUseCloseExam = vi.mocked(useCloseExam);
const mockUseReopenExam = vi.mocked(useReopenExam);
const mockUseCloseExamSession = vi.mocked(useCloseExamSession);
const mockUseReopenExamSession = vi.mocked(useReopenExamSession);

const EXAM = {
  id: 'e1',
  title: 'First Term Examination',
  accessMode: 'OPEN_TO_ELIGIBLE',
};

function snapshot(overrides: Partial<Record<string, unknown>>) {
  return {
    examId: 'e1',
    examStatus: 'READY',
    sessions: [],
    aggregate: {
      authorizedCount: 0,
      notStartedCount: 0,
      inProgressCount: 0,
      submittedCount: 0,
      absentCount: 0,
      attemptDataAvailable: false,
    },
    liveAttempts: [],
    staleness: { isStale: false, openSince: null, thresholdMs: 14_400_000 },
    computedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as never;
}

describe('ExamControlCenterScreen', () => {
  beforeEach(() => {
    mockUseHasPermission.mockReturnValue(true);
    mockUseExam.mockReturnValue({
      data: EXAM,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseExamControlStream.mockReturnValue({ status: 'live' });
    mockUseOpenExamSession.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseCloseExam.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseReopenExam.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseCloseExamSession.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseReopenExamSession.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  });

  it('shows "Open a session" for a READY exam and no other lifecycle action', () => {
    mockUseExamControl.mockReturnValue({
      data: snapshot({ examStatus: 'READY' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByRole('button', { name: /open a session/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /close exam to new attempts/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reopen exam/i })).not.toBeInTheDocument();
  });

  it('shows Close (not Reopen) for an OPEN exam', () => {
    mockUseExamControl.mockReturnValue({
      data: snapshot({ examStatus: 'OPEN' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByRole('button', { name: /close exam to new attempts/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reopen exam/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end examination/i })).toBeInTheDocument();
  });

  it('shows Reopen (not Close) for a CLOSED exam', () => {
    mockUseExamControl.mockReturnValue({
      data: snapshot({ examStatus: 'CLOSED' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByRole('button', { name: /reopen exam/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /close exam to new attempts/i }),
    ).not.toBeInTheDocument();
  });

  it('disables every mutating control when the stream is permanently closed', () => {
    mockUseExamControlStream.mockReturnValue({ status: 'closed-permanent' });
    mockUseExamControl.mockReturnValue({
      data: snapshot({ examStatus: 'OPEN' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByRole('button', { name: /close exam to new attempts/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /end examination/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/connection lost/i);
    // Bug fix: `isBlocked` must reach the row-level/delegate mutating
    // controls too, not just the four primary action-bar buttons — this
    // screen's own doc comment claims "every mutating control" disables.
    expect(screen.getByTestId('sessions-table')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('delegates')).toHaveAttribute('data-disabled', 'true');
  });

  it('bug fix: does not disable SessionsTable/DelegatesSection while merely reconnecting', () => {
    mockUseExamControlStream.mockReturnValue({ status: 'reconnecting' });
    mockUseExamControl.mockReturnValue({
      data: snapshot({ examStatus: 'OPEN' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByTestId('sessions-table')).toHaveAttribute('data-disabled', 'false');
    expect(screen.getByTestId('delegates')).toHaveAttribute('data-disabled', 'false');
  });

  it('bug fix: End Examination visibility is gated by examAdmin.controlCenter, matching the real server gate on POST .../complete — not examAdmin.markAbsence', () => {
    mockUseExamControl.mockReturnValue({
      data: snapshot({ examStatus: 'OPEN' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(mockUseHasPermission).toHaveBeenCalledWith('examAdmin.controlCenter');
    expect(mockUseHasPermission).not.toHaveBeenCalledWith('examAdmin.markAbsence');
  });

  it('does not disable controls while merely reconnecting — a REST call can still succeed', () => {
    mockUseExamControlStream.mockReturnValue({ status: 'reconnecting' });
    mockUseExamControl.mockReturnValue({
      data: snapshot({ examStatus: 'OPEN' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByRole('button', { name: /close exam to new attempts/i })).not.toBeDisabled();
  });

  it('opens the Open Session dialog and confirms it', async () => {
    const openSession = vi.fn().mockResolvedValue(undefined);
    mockUseOpenExamSession.mockReturnValue({ mutateAsync: openSession, isPending: false } as never);
    mockUseExamControl.mockReturnValue({
      data: snapshot({ examStatus: 'READY' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    await userEvent.click(screen.getByRole('button', { name: /open a session/i }));
    await userEvent.click(screen.getByRole('button', { name: /^open session$/i }));
    expect(openSession).toHaveBeenCalledWith({ sessionType: 'STANDARD' });
  });

  it('renders the live-attempts table with real per-student rows instead of the B12 placeholder', () => {
    mockUseExamParticipation.mockReturnValue({
      data: {
        examId: 'e1',
        students: [
          {
            studentProfileId: 'p-ada',
            studentName: 'Ada Obi',
            rollupStatus: 'PENDING',
            sessions: [],
          },
          {
            studentProfileId: 'p-tunde',
            studentName: 'Tunde Bello',
            rollupStatus: 'PENDING',
            sessions: [],
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseExamControl.mockReturnValue({
      data: snapshot({
        examStatus: 'OPEN',
        liveAttempts: [
          {
            studentProfileId: 'p-tunde',
            studentName: 'Tunde Bello',
            status: 'IN_PROGRESS',
            startedAt: '2026-01-01T00:00:00Z',
            timeRemainingSeconds: 2538,
          },
        ],
      }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByRole('heading', { name: /live attempts/i })).toBeInTheDocument();
    expect(
      screen.queryByText(/live attempt tracking is not yet available/i),
    ).not.toBeInTheDocument();
    // In progress rows sort first (04 §46): the starting student's real
    // status badge and countdown appear; a non-starter renders Not started
    // (the aggregate StatTile label uses the same words, so scope to rows).
    expect(screen.getByText('Tunde Bello')).toBeInTheDocument();
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    expect(screen.getByRole('row', { name: /ada obi/i }).textContent).toContain('Not started');
  });

  it('shows a loading state', () => {
    mockUseExam.mockReturnValue({ data: undefined, isPending: true, isError: false } as never);
    mockUseExamControl.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
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
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});
