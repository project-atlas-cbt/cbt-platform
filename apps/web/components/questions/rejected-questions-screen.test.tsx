import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RejectedQuestionsScreen } from './rejected-questions-screen';
import { useQuestionCounts, useQuestionsPaginated } from '@/lib/questions/queries';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/questions/queries', () => ({
  useQuestionsPaginated: vi.fn(),
  useQuestionCounts: vi.fn(),
  useAssignedSubjects: vi.fn(() => ({ data: { subjects: [] } })),
}));
vi.mock('@/lib/questions/use-export-questions', () => ({
  useExportQuestions: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock('@/lib/academics/queries', () => ({
  useSubjects: vi.fn(() => ({ data: { subjects: [] } })),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn(() => true) }));

const mockUseQuestionsPaginated = vi.mocked(useQuestionsPaginated);
const mockUseQuestionCounts = vi.mocked(useQuestionCounts);

const EMPTY_COUNTS = {
  draft: 0,
  submitted: 0,
  underReview: 0,
  approved: 0,
  rejected: 0,
  archived: 0,
};

describe('RejectedQuestionsScreen', () => {
  it('shows a loading state while the counts are still resolving', () => {
    mockUseQuestionCounts.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    } as never);
    render(<RejectedQuestionsScreen basePath="/teacher/question-bank/rejected" />);
    // Never falls through to QuestionBankScreen's own (different) empty
    // state while the real answer is still in flight — the flash-of-wrong-
    // content bug this fix closes.
    expect(screen.queryByText('No rejected questions')).not.toBeInTheDocument();
    expect(screen.queryByText('Question Bank')).not.toBeInTheDocument();
  });

  it('shows the honest "not yet available" empty state when there are genuinely zero rejected questions', () => {
    mockUseQuestionCounts.mockReturnValue({
      isPending: false,
      isError: false,
      data: EMPTY_COUNTS,
    } as never);
    render(<RejectedQuestionsScreen basePath="/teacher/question-bank/rejected" />);
    expect(screen.getByText('No rejected questions')).toBeInTheDocument();
    expect(screen.getByText(/nothing within your scope has been rejected/i)).toBeInTheDocument();
  });

  it('renders the real, filtered list once a rejected question genuinely exists', () => {
    mockUseQuestionCounts.mockReturnValue({
      isPending: false,
      isError: false,
      data: { ...EMPTY_COUNTS, rejected: 1 },
    } as never);
    mockUseQuestionsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        questions: [
          {
            id: 'q1',
            subjectName: 'Mathematics',
            level: 'SS2',
            topicName: null,
            difficulty: 'EASY',
            currentStatus: 'REJECTED',
            authorName: 'Ada Okoye',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      },
    } as never);
    render(<RejectedQuestionsScreen basePath="/teacher/question-bank/rejected" />);
    expect(screen.queryByText('No rejected questions')).not.toBeInTheDocument();
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
  });
});
