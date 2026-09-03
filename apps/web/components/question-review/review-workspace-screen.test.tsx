import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReviewQueue, useReviewWorkspace } from '@/lib/question-review/queries';
import { ReviewWorkspace } from './review-workspace-screen';

const push = vi.fn();
const prefetchQuery = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/question-review/queries', () => ({
  useReviewQueue: vi.fn(),
  useReviewWorkspace: vi.fn(),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQueryClient: () => ({ prefetchQuery }) };
});
vi.mock('./decision-panel', () => ({
  DecisionPanel: ({ onDecided }: { questionId: string; onDecided: () => void }) => (
    <button type="button" onClick={onDecided}>
      Simulate decision
    </button>
  ),
}));

const mockUseReviewQueue = vi.mocked(useReviewQueue);
const mockUseReviewWorkspace = vi.mocked(useReviewWorkspace);

const WORKSPACE = {
  questionId: 'q2',
  subjectId: 'math',
  subjectName: 'Mathematics',
  level: 'SS2',
  authorTeacherProfileId: 'tp1',
  authorName: 'Mr Ade',
  currentRevision: {
    id: 'rev1',
    status: 'SUBMITTED',
    content: '<p>What is 2 + 2?</p>',
    difficulty: 'EASY',
    marks: 1,
    topicName: null,
    explanation: null,
    options: [
      { id: 'o1', content: '4', correctFlag: true },
      { id: 'o2', content: '3', correctFlag: false },
    ],
    media: [],
  },
  history: [],
};

const QUEUE = {
  subjects: [
    {
      subjectId: 'math',
      subjectName: 'Mathematics',
      pendingCount: 3,
      items: [
        { questionId: 'q1', submittedAt: '2026-09-01T00:00:00.000Z' },
        { questionId: 'q2', submittedAt: '2026-09-02T00:00:00.000Z' },
        { questionId: 'q3', submittedAt: '2026-09-03T00:00:00.000Z' },
      ],
    },
  ],
};

describe('ReviewWorkspace', () => {
  beforeEach(() => {
    push.mockReset();
    prefetchQuery.mockReset();
    mockUseReviewQueue.mockReturnValue({ data: QUEUE } as never);
  });

  it('shows a loading state', () => {
    mockUseReviewWorkspace.mockReturnValue({ isPending: true, isError: false } as never);
    render(<ReviewWorkspace questionId="q2" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry', () => {
    const refetch = vi.fn();
    mockUseReviewWorkspace.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<ReviewWorkspace questionId="q2" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the complete question, options, and metadata (DoD item 3)', () => {
    mockUseReviewWorkspace.mockReturnValue({
      isPending: false,
      isError: false,
      data: WORKSPACE,
    } as never);
    render(<ReviewWorkspace questionId="q2" />);
    expect(screen.getByText(/what is 2 \+ 2\?/i)).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/mr ade/i)).toBeInTheDocument();
  });

  it('prefetches both neighbours from the queue order (instant Next)', () => {
    mockUseReviewWorkspace.mockReturnValue({
      isPending: false,
      isError: false,
      data: WORKSPACE,
    } as never);
    render(<ReviewWorkspace questionId="q2" />);
    expect(prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['reviews', 'questions', 'q1'] }),
    );
    expect(prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['reviews', 'questions', 'q3'] }),
    );
  });

  it('Previous/Next navigate using the queue order', async () => {
    mockUseReviewWorkspace.mockReturnValue({
      isPending: false,
      isError: false,
      data: WORKSPACE,
    } as never);
    render(<ReviewWorkspace questionId="q2" />);
    await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(push).toHaveBeenCalledWith('/hod/question-review/q3');
    await userEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(push).toHaveBeenCalledWith('/hod/question-review/q1');
  });

  it('a confirmed decision advances to the next question in queue order', async () => {
    mockUseReviewWorkspace.mockReturnValue({
      isPending: false,
      isError: false,
      data: WORKSPACE,
    } as never);
    render(<ReviewWorkspace questionId="q2" />);
    await userEvent.click(screen.getByRole('button', { name: /simulate decision/i }));
    expect(push).toHaveBeenCalledWith('/hod/question-review/q3');
  });

  it('with no next question, a decision returns to the queue list', async () => {
    mockUseReviewWorkspace.mockReturnValue({
      isPending: false,
      isError: false,
      data: WORKSPACE,
    } as never);
    render(<ReviewWorkspace questionId="q3" />);
    await userEvent.click(screen.getByRole('button', { name: /simulate decision/i }));
    expect(push).toHaveBeenCalledWith('/hod/question-review');
  });
});
