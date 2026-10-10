import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useHasPermission } from '@/lib/nav';
import { useExamsPaginated } from '@/lib/exams/queries';
import { useMyTeacherAssignments } from '@/lib/exams/queries';
import { useSubjects, useClasses, useDepartments, useTeachers } from '@/lib/academics/queries';
import { ExamListScreen } from './exam-list-screen';

const replace = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/exams/queries', () => ({
  useExamsPaginated: vi.fn(),
  useMyTeacherAssignments: vi.fn(),
  useOwnExamsFilter: (enabled: boolean) => (enabled ? { teacherMembershipId: 'm-me' } : {}),
}));
vi.mock('@/lib/academics/queries', () => ({
  useSubjects: vi.fn(),
  useClasses: vi.fn(),
  useDepartments: vi.fn(),
  useTeachers: vi.fn(),
}));

const mockUseHasPermission = vi.mocked(useHasPermission);
const mockUseExamsPaginated = vi.mocked(useExamsPaginated);
const mockUseMyTeacherAssignments = vi.mocked(useMyTeacherAssignments);
const mockUseSubjects = vi.mocked(useSubjects);
const mockUseClasses = vi.mocked(useClasses);
const mockUseDepartments = vi.mocked(useDepartments);
const mockUseTeachers = vi.mocked(useTeachers);

const EXAMS = [
  {
    id: 'exam-1',
    title: 'First Term Examination',
    examType: 'Examination',
    status: 'DRAFT',
    subjectName: 'Mathematics',
    createdByName: 'Ade Ola',
    classes: [
      {
        id: 'ec1',
        classId: 'c1',
        classSubjectId: 'cs1',
        className: 'SS2A',
        level: 'SS2',
        arm: 'A',
      },
    ],
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

describe('ExamListScreen', () => {
  beforeEach(() => {
    params = new URLSearchParams();
    replace.mockReset();
    mockUseSubjects.mockReturnValue({ data: { subjects: [] } } as never);
    mockUseClasses.mockReturnValue({ data: { classes: [] } } as never);
    mockUseDepartments.mockReturnValue({ data: { departments: [] } } as never);
    mockUseTeachers.mockReturnValue({ data: { teachers: [] } } as never);
    mockUseMyTeacherAssignments.mockReturnValue({ data: { assignments: [] } } as never);
    mockUseExamsPaginated.mockReturnValue({
      data: { exams: EXAMS, total: 1, page: 1, pageSize: 25 },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it("ADR-0037: a teacher's Exams screen asks only for their own exams; oversight does not", () => {
    mockUseHasPermission.mockReturnValue(true);
    const { rerender } = render(<ExamListScreen basePath="/teacher/exams" scope="own" />);
    expect(mockUseExamsPaginated).toHaveBeenLastCalledWith(
      expect.objectContaining({ teacherMembershipId: 'm-me' }),
    );
    rerender(<ExamListScreen basePath="/school/exams" scope="oversight" />);
    expect(mockUseExamsPaginated.mock.lastCall?.[0]).not.toHaveProperty('teacherMembershipId');
  });

  it('shows "New exam" only for the Teacher root, and only when exam.create is granted', () => {
    mockUseHasPermission.mockReturnValue(true);
    const { rerender } = render(<ExamListScreen basePath="/teacher/exams" scope="own" />);
    expect(screen.getByRole('link', { name: /new exam/i })).toBeInTheDocument();

    rerender(<ExamListScreen basePath="/school/exams" scope="oversight" />);
    expect(screen.queryByRole('link', { name: /new exam/i })).not.toBeInTheDocument();
  });

  it('does not show "New exam" on the Teacher root when exam.create is denied', () => {
    mockUseHasPermission.mockReturnValue(false);
    render(<ExamListScreen basePath="/teacher/exams" scope="own" />);
    expect(screen.queryByRole('link', { name: /new exam/i })).not.toBeInTheDocument();
  });

  it('renders a Teacher column only for oversight scope', () => {
    mockUseHasPermission.mockReturnValue(false);
    const { rerender } = render(<ExamListScreen basePath="/school/exams" scope="oversight" />);
    expect(screen.getByRole('columnheader', { name: /teacher/i })).toBeInTheDocument();

    rerender(<ExamListScreen basePath="/teacher/exams" scope="own" />);
    expect(screen.queryByRole('columnheader', { name: /teacher/i })).not.toBeInTheDocument();
  });

  it('P3-17: offers the Teacher filter only to roles that may list teachers', () => {
    mockUseHasPermission.mockImplementation((resource) => resource !== 'users.teacher.view');
    render(<ExamListScreen basePath="/hod/exams" scope="oversight" />);
    expect(mockUseTeachers).toHaveBeenLastCalledWith({ enabled: false });
    expect(screen.queryByLabelText('Teacher')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Department')).toBeInTheDocument();
  });

  it('shows the Teacher filter to School Admins and Moderators', () => {
    mockUseHasPermission.mockReturnValue(true);
    render(<ExamListScreen basePath="/school/exams" scope="oversight" />);
    expect(mockUseTeachers).toHaveBeenLastCalledWith({ enabled: true });
    expect(screen.getByLabelText('Teacher')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseExamsPaginated.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as never);
    render(<ExamListScreen basePath="/teacher/exams" scope="own" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseExamsPaginated.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as never);
    render(<ExamListScreen basePath="/teacher/exams" scope="own" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});
