import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionBankScreen } from './question-bank-screen';
import { useQuestionCounts, useQuestionsPaginated } from '@/lib/questions/queries';
import { useExportQuestions } from '@/lib/questions/use-export-questions';
import { useSubjects } from '@/lib/academics/queries';
import { useHasPermission } from '@/lib/nav';

const replace = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
vi.mock('@/lib/questions/queries', () => ({
  useQuestionCounts: vi.fn(),
  useQuestionsPaginated: vi.fn(),
}));
vi.mock('@/lib/questions/use-export-questions', () => ({ useExportQuestions: vi.fn() }));
vi.mock('@/lib/academics/queries', () => ({ useSubjects: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseQuestionCounts = vi.mocked(useQuestionCounts);
const mockUseQuestionsPaginated = vi.mocked(useQuestionsPaginated);
const mockUseExportQuestions = vi.mocked(useExportQuestions);
const mockUseSubjects = vi.mocked(useSubjects);
const mockUseHasPermission = vi.mocked(useHasPermission);

const QUESTIONS = [
  {
    id: 'q1',
    subjectName: 'Mathematics',
    level: 'SS2',
    topicName: 'Quadratic Equations',
    difficulty: 'EASY',
    currentStatus: 'DRAFT',
    authorName: 'Ada Okoye',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

describe('QuestionBankScreen', () => {
  beforeEach(() => {
    params = new URLSearchParams();
    replace.mockReset();
    mockUseSubjects.mockReturnValue({ data: { subjects: [] } } as never);
    mockUseQuestionCounts.mockReturnValue({
      data: { draft: 1, submitted: 0, underReview: 0, approved: 0, rejected: 0, archived: 0 },
    } as never);
    mockUseExportQuestions.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading state', () => {
    mockUseQuestionsPaginated.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    } as never);
    render(<QuestionBankScreen basePath="/teacher/question-bank" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry', () => {
    const refetch = vi.fn();
    mockUseQuestionsPaginated.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<QuestionBankScreen basePath="/teacher/question-bank" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows the first-run empty state', () => {
    mockUseQuestionsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { questions: [], total: 0, page: 1, pageSize: 25 },
    } as never);
    render(<QuestionBankScreen basePath="/teacher/question-bank" />);
    expect(screen.getByText('No questions yet')).toBeInTheDocument();
  });

  it('renders real rows with the author shown', () => {
    mockUseQuestionsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { questions: QUESTIONS, total: 1, page: 1, pageSize: 25 },
    } as never);
    render(<QuestionBankScreen basePath="/teacher/question-bank" />);
    expect(screen.getByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('Ada Okoye')).toBeInTheDocument();
  });

  it('hides Create/Import/Export for an actor without the grants', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseQuestionsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { questions: [], total: 0, page: 1, pageSize: 25 },
    } as never);
    render(<QuestionBankScreen basePath="/teacher/question-bank" />);
    expect(screen.queryByRole('link', { name: /create question/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^import$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
  });

  it('changing a status tab updates the URL, resetting to page 1', async () => {
    mockUseQuestionsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { questions: [], total: 0, page: 1, pageSize: 25 },
    } as never);
    render(<QuestionBankScreen basePath="/teacher/question-bank" />);
    await userEvent.click(screen.getByRole('tab', { name: /draft/i }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('status=DRAFT'));
  });

  it('hides the status tab strip and links to a pinned status', () => {
    mockUseQuestionsPaginated.mockReturnValue({
      isPending: false,
      isError: false,
      data: { questions: QUESTIONS, total: 1, page: 1, pageSize: 25 },
    } as never);
    render(
      <QuestionBankScreen basePath="/teacher/question-bank/rejected" pinnedStatus="REJECTED" />,
    );
    expect(screen.queryByRole('tab', { name: /^all$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /rejected questions/i })).not.toBeInTheDocument();
  });
});
