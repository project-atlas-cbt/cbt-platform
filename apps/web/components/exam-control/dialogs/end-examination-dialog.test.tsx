import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api';
import { useEligibleStudents } from '@/lib/exam-control/queries';
import { useCompleteExam } from '@/lib/exam-control/mutations';
import { EndExaminationDialog } from './end-examination-dialog';

vi.mock('@/lib/exam-control/queries', () => ({ useEligibleStudents: vi.fn() }));
vi.mock('@/lib/exam-control/mutations', () => ({ useCompleteExam: vi.fn() }));

const mockUseEligibleStudents = vi.mocked(useEligibleStudents);
const mockUseCompleteExam = vi.mocked(useCompleteExam);

function student(overrides: Partial<Record<string, unknown>>) {
  return {
    studentProfileId: 'sp1',
    studentIdNumber: 'ST-001',
    studentName: 'Tunde Bello',
    eligible: true,
    failedChecks: [],
    participantStatus: 'AUTHORIZED',
    ...overrides,
  };
}

describe('EndExaminationDialog', () => {
  const refetch = vi.fn();
  const complete = vi.fn();

  beforeEach(() => {
    refetch.mockReset();
    complete.mockReset();
    mockUseCompleteExam.mockReturnValue({ mutateAsync: complete, isPending: false } as never);
  });

  it("shows only the AUTHORIZED (pending) students by name, matching the server's own pending-set computation", () => {
    mockUseEligibleStudents.mockReturnValue({
      data: {
        students: [
          student({
            studentProfileId: 'sp1',
            studentName: 'Tunde Bello',
            participantStatus: 'AUTHORIZED',
          }),
          student({
            studentProfileId: 'sp2',
            studentName: 'Ada Okoye',
            participantStatus: 'REVOKED',
          }),
        ],
      },
      isPending: false,
      isError: false,
      refetch,
    } as never);
    render(
      <EndExaminationDialog
        examId="e1"
        open
        onOpenChange={vi.fn()}
        openSessions={[]}
        onRequestCloseSession={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );
    expect(screen.getByText(/tunde bello/i)).toBeInTheDocument();
    expect(screen.queryByText(/ada okoye/i)).not.toBeInTheDocument();
  });

  it('blocks confirming and lists open sessions, delegating close to the parent, when any session is still open', async () => {
    mockUseEligibleStudents.mockReturnValue({
      data: { students: [] },
      isPending: false,
      isError: false,
      refetch,
    } as never);
    const onRequestCloseSession = vi.fn();
    render(
      <EndExaminationDialog
        examId="e1"
        open
        onOpenChange={vi.fn()}
        openSessions={[{ id: 's1', sessionType: 'STANDARD' } as never]}
        onRequestCloseSession={onRequestCloseSession}
        onCompleted={vi.fn()}
      />,
    );
    expect(screen.getByText(/close every open session/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /end examination/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /close this session/i }));
    expect(onRequestCloseSession).toHaveBeenCalledWith('s1');
  });

  it('confirms with exactly the pending ids and closes on success', async () => {
    mockUseEligibleStudents.mockReturnValue({
      data: { students: [student({ studentProfileId: 'sp1', participantStatus: 'AUTHORIZED' })] },
      isPending: false,
      isError: false,
      refetch,
    } as never);
    complete.mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const onCompleted = vi.fn();
    render(
      <EndExaminationDialog
        examId="e1"
        open
        onOpenChange={onOpenChange}
        openSessions={[]}
        onRequestCloseSession={vi.fn()}
        onCompleted={onCompleted}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /end examination/i }));
    expect(complete).toHaveBeenCalledWith(['sp1']);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onCompleted).toHaveBeenCalled();
  });

  it('on STALE_ABSENTEE_LIST: stays open, refetches, and requires an explicit re-confirm rather than silently resubmitting', async () => {
    mockUseEligibleStudents.mockReturnValue({
      data: { students: [student({ studentProfileId: 'sp1', participantStatus: 'AUTHORIZED' })] },
      isPending: false,
      isError: false,
      refetch,
    } as never);
    complete.mockRejectedValue(
      new ApiError({
        code: 'STALE_ABSENTEE_LIST',
        message: 'The confirmed absentee list does not match the current pending set.',
        retryable: false,
        correlationId: 'corr-1',
      }),
    );
    const onOpenChange = vi.fn();
    render(
      <EndExaminationDialog
        examId="e1"
        open
        onOpenChange={onOpenChange}
        openSessions={[]}
        onRequestCloseSession={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /end examination/i }));
    expect(await screen.findByText(/the list changed/i)).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // Never auto-resubmits — the mutation was called exactly once so far.
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
