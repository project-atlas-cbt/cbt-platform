import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useReviewQueue } from '@/lib/question-review/queries';
import { ReviewQueue } from './review-queue-screen';

vi.mock('@/lib/question-review/queries', () => ({ useReviewQueue: vi.fn() }));

const mockUseReviewQueue = vi.mocked(useReviewQueue);

describe('ReviewQueue', () => {
  it('shows a loading state', () => {
    mockUseReviewQueue.mockReturnValue({ isPending: true, isError: false } as never);
    render(<ReviewQueue />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry', () => {
    const refetch = vi.fn();
    mockUseReviewQueue.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<ReviewQueue />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows the true empty-queue state (DoD item 11)', () => {
    mockUseReviewQueue.mockReturnValue({
      isPending: false,
      isError: false,
      data: { subjects: [] },
    } as never);
    render(<ReviewQueue />);
    expect(screen.getByText(/queue is empty/i)).toBeInTheDocument();
  });

  it('groups pending items by subject with counts and an Open review link per row', () => {
    mockUseReviewQueue.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        subjects: [
          {
            subjectId: 'math',
            subjectName: 'Mathematics',
            pendingCount: 1,
            items: [
              {
                questionId: 'q1',
                subjectId: 'math',
                subjectName: 'Mathematics',
                level: 'SS2',
                authorTeacherProfileId: 'tp1',
                authorName: 'Mr Ade',
                submittedAt: new Date().toISOString(),
                revision: { content: '<p>What is 2 + 2?</p>' },
              },
            ],
          },
        ],
      },
    } as never);
    render(<ReviewQueue />);
    expect(screen.getByText(/mathematics/i)).toBeInTheDocument();
    expect(screen.getByText('Mr Ade')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open review/i })).toHaveAttribute(
      'href',
      '/hod/question-review/q1',
    );
  });

  it("the School Admin's queue lists only questions no HOD can review, with the reason (ADR-0038)", () => {
    const item = (questionId: string, fallbackReason: string | null) => ({
      questionId,
      subjectId: 'math',
      subjectName: 'Mathematics',
      level: 'SS2',
      authorTeacherProfileId: 'tp1',
      authorName: `Author ${questionId}`,
      submittedAt: new Date().toISOString(),
      revision: { content: `<p>${questionId}</p>` },
      fallbackReason,
    });
    mockUseReviewQueue.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        subjects: [
          {
            subjectId: 'math',
            subjectName: 'Mathematics',
            pendingCount: 2,
            items: [item('q1', null), item('q2', 'NO_HOD')],
          },
        ],
      },
    } as never);
    render(<ReviewQueue basePath="/school/question-review" fallbackOnly />);
    expect(screen.queryByText('Author q1')).not.toBeInTheDocument();
    expect(screen.getByText('Author q2')).toBeInTheDocument();
    expect(screen.getByText(/its department has no hod/i)).toBeInTheDocument();
    expect(screen.getByText(/1 question awaiting review/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open review/i })).toHaveAttribute(
      'href',
      '/school/question-review/q2',
    );
  });

  it("the School Admin's queue explains an empty queue", () => {
    mockUseReviewQueue.mockReturnValue({
      isPending: false,
      isError: false,
      data: { subjects: [] },
    } as never);
    render(<ReviewQueue fallbackOnly />);
    expect(screen.getByText(/has an hod who can review it/i)).toBeInTheDocument();
  });
});
