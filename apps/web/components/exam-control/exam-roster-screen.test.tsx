import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useHasPermission } from '@/lib/nav';
import { useExam } from '@/lib/exams/queries';
import { useExamControl, useEligibleStudents } from '@/lib/exam-control/queries';
import { useRevokeParticipant } from '@/lib/exam-control/mutations';
import { ExamRosterScreen } from './exam-roster-screen';

const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/exams/queries', () => ({ useExam: vi.fn() }));
vi.mock('@/lib/exam-control/queries', () => ({
  useExamControl: vi.fn(),
  useEligibleStudents: vi.fn(),
}));
vi.mock('@/lib/exam-control/mutations', () => ({ useRevokeParticipant: vi.fn() }));
vi.mock('./batch-authorizer', () => ({
  BatchAuthorizer: () => <div data-testid="batch-authorizer" />,
}));

const mockUseHasPermission = vi.mocked(useHasPermission);
const mockUseExam = vi.mocked(useExam);
const mockUseExamControl = vi.mocked(useExamControl);
const mockUseEligibleStudents = vi.mocked(useEligibleStudents);
const mockUseRevokeParticipant = vi.mocked(useRevokeParticipant);

const EXAM = { id: 'e1', title: 'First Term Examination', accessMode: 'OPEN_TO_ELIGIBLE' };
const OPEN_SESSION = {
  id: 's1',
  status: 'OPEN',
  sessionType: 'STANDARD',
  openedAt: '2026-01-01T00:00:00Z',
  reopenedAt: null,
};

describe('ExamRosterScreen', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    replace.mockClear();
    mockUseHasPermission.mockReturnValue(true);
    mockUseExam.mockReturnValue({
      data: EXAM,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseRevokeParticipant.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  });

  it('with no sessionId in the URL, resolves and redirects to the only OPEN session', () => {
    mockUseExamControl.mockReturnValue({
      data: { sessions: [OPEN_SESSION] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseEligibleStudents.mockReturnValue({
      data: { students: [] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamRosterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(replace).toHaveBeenCalledWith('/teacher/exam-control/e1/students?sessionId=s1');
  });

  it('shows an "open a session first" empty state when no session is OPEN', () => {
    mockUseExamControl.mockReturnValue({
      data: { sessions: [] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseEligibleStudents.mockReturnValue({
      data: { students: [] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamRosterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByText(/open a session before authorizing students/i)).toBeInTheDocument();
  });

  it('renders the roster and BatchAuthorizer once a session is resolved from the URL', () => {
    searchParams = new URLSearchParams('sessionId=s1');
    mockUseExamControl.mockReturnValue({
      data: { sessions: [OPEN_SESSION] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseEligibleStudents.mockReturnValue({
      data: {
        students: [
          {
            studentProfileId: 'sp1',
            studentIdNumber: 'ST-001',
            studentName: 'Tunde Bello',
            eligible: true,
            failedChecks: [],
            participantStatus: 'AUTHORIZED',
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<ExamRosterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByTestId('batch-authorizer')).toBeInTheDocument();
    expect(screen.getByText('Tunde Bello')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    mockUseExam.mockReturnValue({ data: undefined, isPending: true, isError: false } as never);
    mockUseExamControl.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as never);
    mockUseEligibleStudents.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as never);
    render(<ExamRosterScreen basePath="/teacher/exam-control" examId="e1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
