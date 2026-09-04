import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useHasPermission } from '@/lib/nav';
import { useExam, useExamReadiness } from '@/lib/exams/queries';
import { useArchiveExam, useCancelExam, useDeleteExamDraft } from '@/lib/exams/mutations';
import { ExamDetailScreen } from './exam-detail-screen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/exams/queries', () => ({
  useExam: vi.fn(),
  useExamReadiness: vi.fn(),
}));
vi.mock('@/lib/exams/mutations', () => ({
  useArchiveExam: vi.fn(),
  useCancelExam: vi.fn(),
  useDeleteExamDraft: vi.fn(),
}));

const mockUseHasPermission = vi.mocked(useHasPermission);
const mockUseExam = vi.mocked(useExam);
const mockUseExamReadiness = vi.mocked(useExamReadiness);
const mockUseArchiveExam = vi.mocked(useArchiveExam);
const mockUseCancelExam = vi.mocked(useCancelExam);
const mockUseDeleteExamDraft = vi.mocked(useDeleteExamDraft);

const EXAM = {
  id: 'exam-1',
  title: 'First Term Examination',
  examType: 'Examination',
  status: 'READY',
  academicSessionId: 's1',
  sessionName: '2026/2027',
  academicTermId: 't1',
  termName: 'First Term',
  subjectId: 'sub1',
  subjectName: 'Mathematics',
  departmentId: null,
  departmentName: null,
  createdByMembershipId: 'm1',
  createdByName: 'Ade Ola',
  classes: [
    { id: 'ec1', classId: 'c1', classSubjectId: 'cs1', className: 'SS2A', level: 'SS2', arm: 'A' },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  durationSeconds: 3600,
  attemptLimit: 1,
  navigationPolicy: 'FREE',
  randomizeQuestions: false,
  randomizeOptions: false,
  resultPolicy: 'TEACHER',
  resultDetailVisibility: 'SCORE_ONLY',
  accessMode: 'OPEN_TO_ELIGIBLE',
  generalInstructions: null,
  navigationInstructions: null,
  submissionInstructions: null,
  accommodations: null,
  cancelledReason: null,
  cancelledAt: null,
  archivedAt: null,
  sections: [{ id: 'sec1', title: 'Main Section', sequence: 1, marks: 40, questions: [] }],
};

describe('ExamDetailScreen (oversight roots — School Admin/Moderator/HOD)', () => {
  beforeEach(() => {
    mockUseExam.mockReturnValue({
      data: EXAM,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseExamReadiness.mockReturnValue({
      data: { examId: 'exam-1', ready: true, checks: [] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseArchiveExam.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseCancelExam.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseDeleteExamDraft.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  });

  it('shows only Cancel/Archive when the actor holds those grants but not delete-draft — never any wizard-edit control', () => {
    mockUseHasPermission.mockImplementation((id) => id === 'exam.cancel' || id === 'exam.archive');
    render(<ExamDetailScreen basePath="/school/exams" examId="exam-1" />);

    expect(screen.getByRole('button', { name: /cancel exam/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive exam/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete draft/i })).not.toBeInTheDocument();

    // No wizard-edit surface anywhere — this is a read view, not a co-author view.
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/exam title/i)).not.toBeInTheDocument();

    // The read-only summary is still shown.
    expect(screen.getByText('First Term Examination')).toBeInTheDocument();
  });

  it('shows no lifecycle actions at all when the actor holds none of the grants', () => {
    mockUseHasPermission.mockReturnValue(false);
    render(<ExamDetailScreen basePath="/hod/exams" examId="exam-1" />);
    expect(screen.queryByRole('button', { name: /cancel exam/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive exam/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete draft/i })).not.toBeInTheDocument();
  });

  it('shows a loading state', () => {
    mockUseHasPermission.mockReturnValue(true);
    mockUseExam.mockReturnValue({ data: undefined, isPending: true, isError: false } as never);
    render(<ExamDetailScreen basePath="/school/exams" examId="exam-1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry', () => {
    mockUseHasPermission.mockReturnValue(true);
    const refetch = vi.fn();
    mockUseExam.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<ExamDetailScreen basePath="/school/exams" examId="exam-1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});
