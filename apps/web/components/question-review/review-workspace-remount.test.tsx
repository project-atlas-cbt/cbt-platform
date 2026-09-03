import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api';
import { useReviewQueue, useReviewWorkspace } from '@/lib/question-review/queries';
import {
  useApproveReview,
  useRejectReview,
  useRequestChangesReview,
} from '@/lib/question-review/mutations';
import { ReviewWorkspace } from './review-workspace-screen';

const push = vi.fn();
const prefetchQuery = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/question-review/queries', () => ({
  useReviewQueue: vi.fn(),
  useReviewWorkspace: vi.fn(),
}));
vi.mock('@/lib/question-review/mutations', () => ({
  useApproveReview: vi.fn(),
  useRejectReview: vi.fn(),
  useRequestChangesReview: vi.fn(),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQueryClient: () => ({ prefetchQuery }) };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUseReviewQueue = vi.mocked(useReviewQueue);
const mockUseReviewWorkspace = vi.mocked(useReviewWorkspace);
const mockUseApprove = vi.mocked(useApproveReview);
const mockUseReject = vi.mocked(useRejectReview);
const mockUseRequestChanges = vi.mocked(useRequestChangesReview);

function workspaceFor(questionId: string) {
  return {
    questionId,
    subjectId: 'math',
    subjectName: 'Mathematics',
    level: 'SS2',
    authorTeacherProfileId: 'tp1',
    authorName: 'Mr Ade',
    currentRevision: {
      id: 'rev1',
      status: 'SUBMITTED',
      content: '<p>Question content</p>',
      difficulty: 'EASY',
      marks: 1,
      topicName: null,
      explanation: null,
      options: [{ id: 'o1', content: 'A', correctFlag: true }],
      media: [],
    },
    history: [],
  };
}

function selfReviewError() {
  return new ApiError({
    code: 'QUESTION_SELF_REVIEW_FORBIDDEN',
    message: 'You cannot review your own question.',
    retryable: false,
    correlationId: 'corr-1',
  });
}

/**
 * F10 gap closure — real `DecisionPanel` (not mocked, unlike
 * `review-workspace-screen.test.tsx`'s own suite), driven through
 * `rerender` with a *different* `questionId` prop rather than a fresh
 * `render()`. This is the exact shape of the bug: Next.js App Router does
 * not remount this page merely because the `[id]` dynamic segment changed,
 * so `ReviewWorkspace` is reused as the same component instance across
 * in-app Previous/Next navigation — a plain `render()` per test would never
 * have caught the missing-`key` regression this proves against.
 */
describe('ReviewWorkspace — DecisionPanel resets per question (F10 regression)', () => {
  beforeEach(() => {
    push.mockReset();
    prefetchQuery.mockReset();
    mockUseReviewQueue.mockReturnValue({ data: { subjects: [] } } as never);
    mockUseReject.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseRequestChanges.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
  });

  it('a self-review-blocked banner on one question does not carry over to the next after in-app navigation', async () => {
    const approveMutateAsync = vi.fn().mockRejectedValueOnce(selfReviewError());
    mockUseApprove.mockReturnValue({
      mutateAsync: approveMutateAsync,
      isPending: false,
    } as never);
    mockUseReviewWorkspace.mockReturnValue({
      isPending: false,
      isError: false,
      data: workspaceFor('q1'),
    } as never);

    const { rerender } = render(<ReviewWorkspace questionId="q1" />);
    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(await screen.findByText(/cannot review your own submissions/i)).toBeInTheDocument();

    // Simulate the real in-app navigation: the same `ReviewWorkspace`
    // instance re-rendered with a new `questionId` prop, exactly what
    // clicking "Next" (or the queue-advance after a decision) does.
    mockUseReviewWorkspace.mockReturnValue({
      isPending: false,
      isError: false,
      data: workspaceFor('q2'),
    } as never);
    rerender(<ReviewWorkspace questionId="q2" />);

    expect(screen.queryByText(/cannot review your own submissions/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
  });

  it('an in-progress, unsent note on one question does not carry over to the next', async () => {
    mockUseApprove.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseReviewWorkspace.mockReturnValue({
      isPending: false,
      isError: false,
      data: workspaceFor('q1'),
    } as never);

    const { rerender } = render(<ReviewWorkspace questionId="q1" />);
    await userEvent.click(screen.getByRole('button', { name: /add note/i }));
    await userEvent.type(screen.getByLabelText(/note \(optional\)/i), 'Meant for q1 only.');
    expect(screen.getByLabelText(/note \(optional\)/i)).toHaveValue('Meant for q1 only.');

    mockUseReviewWorkspace.mockReturnValue({
      isPending: false,
      isError: false,
      data: workspaceFor('q2'),
    } as never);
    rerender(<ReviewWorkspace questionId="q2" />);

    expect(screen.queryByLabelText(/note \(optional\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/meant for q1 only/i)).not.toBeInTheDocument();
  });
});
