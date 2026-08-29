import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionDetailScreen } from './question-detail-screen';
import { useQuestion } from '@/lib/questions/queries';
import { useArchiveQuestion, useCreateRevision } from '@/lib/questions/mutations';
import { useHasPermission } from '@/lib/nav';

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));
vi.mock('@/lib/questions/queries', () => ({ useQuestion: vi.fn() }));
vi.mock('@/lib/questions/mutations', () => ({
  useArchiveQuestion: vi.fn(),
  useCreateRevision: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseQuestion = vi.mocked(useQuestion);
const mockUseArchive = vi.mocked(useArchiveQuestion);
const mockUseCreateRevision = vi.mocked(useCreateRevision);
const mockUseHasPermission = vi.mocked(useHasPermission);

function question(overrides: Partial<{ status: string; archivedAt: string | null }> = {}) {
  const status = overrides.status ?? 'DRAFT';
  return {
    id: 'q1',
    subjectId: 'sub1',
    subjectName: 'Mathematics',
    level: 'SS2',
    topicId: null,
    topicName: 'Quadratics',
    difficulty: 'EASY',
    marks: 2,
    questionType: 'SINGLE_CHOICE',
    currentStatus: status,
    authorTeacherProfileId: 'tp1',
    authorName: 'Ada Okoye',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    archivedAt: overrides.archivedAt ?? null,
    revisions: [
      {
        id: 'rev1',
        revisionNumber: 1,
        questionType: 'SINGLE_CHOICE',
        content: '<p>2 + 2 = ?</p>',
        topicId: null,
        topicName: null,
        subtopicId: null,
        subtopicName: null,
        difficulty: 'EASY',
        marks: 2,
        explanation: null,
        createdByMembershipId: 'mem1',
        status,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        options: [
          { id: 'o1', content: '4', originalOrder: 0, correctFlag: true },
          { id: 'o2', content: '3', originalOrder: 1, correctFlag: false },
        ],
        media: [],
      },
    ],
  };
}

describe('QuestionDetailScreen', () => {
  const archiveMutateAsync = vi.fn();
  const createRevisionMutateAsync = vi.fn();

  beforeEach(() => {
    searchParams = new URLSearchParams();
    push.mockReset();
    archiveMutateAsync.mockReset();
    createRevisionMutateAsync.mockReset();
    mockUseArchive.mockReturnValue({ mutateAsync: archiveMutateAsync, isPending: false } as never);
    mockUseCreateRevision.mockReturnValue({
      mutateAsync: createRevisionMutateAsync,
      isPending: false,
    } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading state', () => {
    mockUseQuestion.mockReturnValue({ isPending: true, isError: false } as never);
    render(<QuestionDetailScreen questionId="q1" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state', () => {
    mockUseQuestion.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    render(<QuestionDetailScreen questionId="q1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows an Edit action for a DRAFT question and none for Start new revision', () => {
    mockUseQuestion.mockReturnValue({
      isPending: false,
      isError: false,
      data: question(),
    } as never);
    render(<QuestionDetailScreen questionId="q1" />);
    expect(screen.getByRole('link', { name: /edit draft/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start new revision/i })).not.toBeInTheDocument();
  });

  it('confirms before starting a new revision on an APPROVED question, explaining the effect first', async () => {
    mockUseQuestion.mockReturnValue({
      isPending: false,
      isError: false,
      data: question({ status: 'APPROVED' }),
    } as never);
    render(<QuestionDetailScreen questionId="q1" />);

    expect(createRevisionMutateAsync).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /start new revision/i }));
    expect(
      screen.getByText(/stays unchanged until the new one is resubmitted/i),
    ).toBeInTheDocument();
    expect(createRevisionMutateAsync).not.toHaveBeenCalled();

    createRevisionMutateAsync.mockResolvedValueOnce({});
    await userEvent.click(screen.getByRole('button', { name: /^start new revision$/i }));
    expect(createRevisionMutateAsync).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/teacher/question-bank/q1/edit');
  });

  it('shows the "changed elsewhere" notice from the ?notice=locked param', () => {
    searchParams = new URLSearchParams('notice=locked');
    mockUseQuestion.mockReturnValue({
      isPending: false,
      isError: false,
      data: question(),
    } as never);
    render(<QuestionDetailScreen questionId="q1" />);
    expect(screen.getByText(/this question changed since you last opened it/i)).toBeInTheDocument();
  });

  it('archiving asks for confirmation before calling the mutation', async () => {
    mockUseQuestion.mockReturnValue({
      isPending: false,
      isError: false,
      data: question(),
    } as never);
    archiveMutateAsync.mockResolvedValueOnce({});
    render(<QuestionDetailScreen questionId="q1" />);
    await userEvent.click(screen.getByRole('button', { name: /^archive$/i }));
    expect(archiveMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/archive this question\?/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^archive question$/i }));
    expect(archiveMutateAsync).toHaveBeenCalledWith('q1');
  });

  it('hides Edit/Archive for an actor without the grants', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseQuestion.mockReturnValue({
      isPending: false,
      isError: false,
      data: question(),
    } as never);
    render(<QuestionDetailScreen questionId="q1" />);
    expect(screen.queryByRole('link', { name: /edit draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^archive$/i })).not.toBeInTheDocument();
  });
});
