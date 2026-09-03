import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import {
  useApproveReview,
  useRejectReview,
  useRequestChangesReview,
} from '@/lib/question-review/mutations';
import { DecisionPanel } from './decision-panel';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/question-review/mutations', () => ({
  useApproveReview: vi.fn(),
  useRejectReview: vi.fn(),
  useRequestChangesReview: vi.fn(),
}));

const mockUseApprove = vi.mocked(useApproveReview);
const mockUseReject = vi.mocked(useRejectReview);
const mockUseRequestChanges = vi.mocked(useRequestChangesReview);

function selfReviewError() {
  return new ApiError({
    code: 'QUESTION_SELF_REVIEW_FORBIDDEN',
    message: 'You cannot review your own question.',
    retryable: false,
    correlationId: 'corr-1',
  });
}

describe('DecisionPanel', () => {
  const approveMutateAsync = vi.fn();
  const rejectMutateAsync = vi.fn();
  const requestChangesMutateAsync = vi.fn();

  beforeEach(() => {
    approveMutateAsync.mockReset();
    rejectMutateAsync.mockReset();
    requestChangesMutateAsync.mockReset();
    mockUseApprove.mockReturnValue({ mutateAsync: approveMutateAsync, isPending: false } as never);
    mockUseReject.mockReturnValue({ mutateAsync: rejectMutateAsync, isPending: false } as never);
    mockUseRequestChanges.mockReturnValue({
      mutateAsync: requestChangesMutateAsync,
      isPending: false,
    } as never);
    vi.mocked(toast.success).mockClear();
  });

  it('renders the three decision actions and the shortcut hint', () => {
    render(<DecisionPanel questionId="q1" onDecided={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request changes/i })).toBeInTheDocument();
    expect(screen.getByText(/shortcuts/i)).toBeInTheDocument();
  });

  it('Approve submits immediately with no note and calls onDecided (DoD item 4/6, no dialog)', async () => {
    approveMutateAsync.mockResolvedValueOnce({});
    const onDecided = vi.fn();
    render(<DecisionPanel questionId="q1" onDecided={onDecided} />);
    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(approveMutateAsync).toHaveBeenCalledWith({});
    expect(toast.success).toHaveBeenCalled();
    expect(onDecided).toHaveBeenCalled();
  });

  it('an optional note is included when the HOD adds one', async () => {
    approveMutateAsync.mockResolvedValueOnce({});
    render(<DecisionPanel questionId="q1" onDecided={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /add note/i }));
    await userEvent.type(screen.getByLabelText(/note \(optional\)/i), 'Nicely written.');
    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(approveMutateAsync).toHaveBeenCalledWith({ note: 'Nicely written.' });
  });

  it('Reject opens the mandatory-reason dialog rather than submitting directly', async () => {
    render(<DecisionPanel questionId="q1" onDecided={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    expect(screen.getByText(/reject this question\?/i)).toBeInTheDocument();
    expect(rejectMutateAsync).not.toHaveBeenCalled();
  });

  it('confirming the reject dialog calls the mutation and advances (DoD item 4)', async () => {
    rejectMutateAsync.mockResolvedValueOnce({});
    const onDecided = vi.fn();
    render(<DecisionPanel questionId="q1" onDecided={onDecided} />);
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    await userEvent.type(screen.getByLabelText(/reason/i), 'Option B is ambiguous.');
    await userEvent.click(screen.getByRole('button', { name: /^reject question$/i }));
    expect(rejectMutateAsync).toHaveBeenCalledWith({ reason: 'Option B is ambiguous.' });
    expect(onDecided).toHaveBeenCalled();
  });

  it('a self-review block replaces the panel with a permanent explanation (DoD item 10)', async () => {
    approveMutateAsync.mockRejectedValueOnce(selfReviewError());
    render(<DecisionPanel questionId="q1" onDecided={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(await screen.findByText(/cannot review your own submissions/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reject$/i })).not.toBeInTheDocument();
  });

  it('a self-review block on reject closes the dialog cleanly and shows the banner, without leaving onDecided called', async () => {
    rejectMutateAsync.mockRejectedValueOnce(selfReviewError());
    const onDecided = vi.fn();
    render(<DecisionPanel questionId="q1" onDecided={onDecided} />);
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }));
    await userEvent.type(screen.getByLabelText(/reason/i), 'Doesn’t matter.');
    await userEvent.click(screen.getByRole('button', { name: /^reject question$/i }));

    expect(await screen.findByText(/cannot review your own submissions/i)).toBeInTheDocument();
    expect(screen.queryByText(/reject this question\?/i)).not.toBeInTheDocument();
    expect(onDecided).not.toHaveBeenCalled();
  });

  it('the "A" keyboard shortcut approves', async () => {
    approveMutateAsync.mockResolvedValueOnce({});
    render(<DecisionPanel questionId="q1" onDecided={vi.fn()} />);
    await userEvent.keyboard('a');
    expect(approveMutateAsync).toHaveBeenCalledWith({});
  });

  it('keyboard shortcuts are inert while typing in the optional note field', async () => {
    render(<DecisionPanel questionId="q1" onDecided={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /add note/i }));
    await userEvent.type(screen.getByLabelText(/note \(optional\)/i), 'r');
    expect(screen.queryByText(/reject this question\?/i)).not.toBeInTheDocument();
  });
});
