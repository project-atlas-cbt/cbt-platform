import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useReviewQueue } from '@/lib/question-review/queries';
import { ReviewQueueWidget } from './review-queue-widget';

vi.mock('@/lib/question-review/queries', () => ({ useReviewQueue: vi.fn() }));

const mockUseReviewQueue = vi.mocked(useReviewQueue);

describe('ReviewQueueWidget', () => {
  it('shows a loading state', () => {
    mockUseReviewQueue.mockReturnValue({ isPending: true, isError: false } as never);
    render(<ReviewQueueWidget />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state', () => {
    mockUseReviewQueue.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    render(<ReviewQueueWidget />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it("shows the total and per-subject breakdown, matching 04 §29's own mockup shape", () => {
    mockUseReviewQueue.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        subjects: [
          { subjectId: 'math', subjectName: 'Mathematics', pendingCount: 11, items: [] },
          { subjectId: 'phy', subjectName: 'Physics', pendingCount: 7, items: [] },
        ],
      },
    } as never);
    render(<ReviewQueueWidget />);
    expect(screen.getByText(/18 questions awaiting review/i)).toBeInTheDocument();
    expect(screen.getByText(/mathematics — 11/i)).toBeInTheDocument();
    expect(screen.getByText(/physics — 7/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review questions/i })).toHaveAttribute(
      'href',
      '/hod/question-review',
    );
  });

  it('shows a calm empty state when nothing is pending', () => {
    mockUseReviewQueue.mockReturnValue({
      isPending: false,
      isError: false,
      data: { subjects: [] },
    } as never);
    render(<ReviewQueueWidget />);
    expect(screen.getByText(/0 questions awaiting review/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is waiting/i)).toBeInTheDocument();
  });
});
