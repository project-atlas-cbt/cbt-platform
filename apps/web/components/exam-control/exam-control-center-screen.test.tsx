import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHasPermission } from '@/lib/nav';
import { useExam } from '@/lib/exams/queries';
import { useExamControl } from '@/lib/exam-control/queries';
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
vi.mock('./sessions-table', () => ({ SessionsTable: () => <div data-testid="sessions-table" /> }));
vi.mock('./delegates-section', () => ({ DelegatesSection: () => <div data-testid="delegates" /> }));

const mockUseHasPermission = vi.mocked(useHasPermission);
const mockUseExam = vi.mocked(useExam);
const mockUseExamControl = vi.mocked(useExamControl);
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

  it('renders the live-attempts placeholder honestly, not a fabricated table', () => {
    mockUseExamControl.mockReturnValue({
      data: snapshot({ examStatus: 'OPEN' }),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamControlCenterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByText(/live attempt tracking is not yet available/i)).toBeInTheDocument();
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
