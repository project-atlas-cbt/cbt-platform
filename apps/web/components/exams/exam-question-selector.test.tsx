import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAvailableQuestions, useExam } from '@/lib/exams/queries';
import { useSetExamQuestions } from '@/lib/exams/mutations';
import { ExamQuestionSelector } from './exam-question-selector';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/exams/queries', () => ({ useExam: vi.fn(), useAvailableQuestions: vi.fn() }));
vi.mock('@/lib/exams/mutations', () => ({ useSetExamQuestions: vi.fn() }));

describe('ExamQuestionSelector (bug audit P2-5)', () => {
  it('treats a newer approved revision of a question already in the exam as already added', () => {
    vi.mocked(useExam).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        id: 'exam-1',
        status: 'DRAFT',
        sections: [
          {
            id: 's1',
            questions: [
              {
                id: 'eq1',
                questionId: 'q1',
                questionRevisionId: 'rev-1',
                sequence: 1,
                marks: 1,
                content: 'What is 2 + 3?',
                questionType: 'SINGLE_CHOICE',
                difficulty: 'EASY',
                topicName: null,
              },
            ],
          },
        ],
      },
    } as unknown as ReturnType<typeof useExam>);
    vi.mocked(useAvailableQuestions).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        total: 2,
        questions: [
          {
            id: 'q1',
            currentRevisionId: 'rev-2',
            topicName: null,
            difficulty: 'EASY',
            marks: 1,
            authorName: 'Ade Ola',
          },
          {
            id: 'q2',
            currentRevisionId: 'rev-9',
            topicName: null,
            difficulty: 'EASY',
            marks: 1,
            authorName: 'Ade Ola',
          },
        ],
      },
    } as unknown as ReturnType<typeof useAvailableQuestions>);
    vi.mocked(useSetExamQuestions).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useSetExamQuestions>);

    render(<ExamQuestionSelector examId="exam-1" basePath="/teacher/exams" />);

    expect(screen.getByRole('button', { name: 'Added' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });
});
