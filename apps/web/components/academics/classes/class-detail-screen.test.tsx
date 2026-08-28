import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassDetailScreen } from './class-detail-screen';
import {
  useClass,
  useClassRoster,
  useClassSubjects,
  useClassTeachers,
  useDepartments,
  useSession,
  useSubjects,
} from '@/lib/academics/queries';
import { useAddClassSubject, useRemoveClassSubject } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({
  useClass: vi.fn(),
  useClassRoster: vi.fn(),
  useClassSubjects: vi.fn(),
  useClassTeachers: vi.fn(),
  useDepartments: vi.fn(),
  useSession: vi.fn(),
  useSubjects: vi.fn(),
}));
vi.mock('@/lib/academics/mutations', () => ({
  useAddClassSubject: vi.fn(),
  useRemoveClassSubject: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseClass = vi.mocked(useClass);
const mockUseClassRoster = vi.mocked(useClassRoster);
const mockUseClassSubjects = vi.mocked(useClassSubjects);
const mockUseClassTeachers = vi.mocked(useClassTeachers);
const mockUseDepartments = vi.mocked(useDepartments);
const mockUseSession = vi.mocked(useSession);
const mockUseSubjects = vi.mocked(useSubjects);
const mockUseHasPermission = vi.mocked(useHasPermission);

const CLASS = {
  id: 'c1',
  academicSessionId: 's1',
  departmentId: null,
  name: 'SS2A',
  level: 'SS2',
  arm: 'A',
  status: 'ACTIVE',
};

describe('ClassDetailScreen', () => {
  beforeEach(() => {
    mockUseDepartments.mockReturnValue({ data: { departments: [] } } as never);
    mockUseSession.mockReturnValue({
      data: { id: 's1', name: '2026/2027', status: 'CURRENT' },
    } as never);
    mockUseClassSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { offerings: [] },
    } as never);
    mockUseSubjects.mockReturnValue({ data: { subjects: [] } } as never);
    vi.mocked(useAddClassSubject).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(useRemoveClassSubject).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading skeleton while the class is loading', () => {
    mockUseClass.mockReturnValue({ isPending: true, isError: false, data: undefined } as never);
    render(<ClassDetailScreen classId="c1" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry on failure', () => {
    const refetch = vi.fn();
    mockUseClass.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<ClassDetailScreen classId="c1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows the class header with level/session/status badges', () => {
    mockUseClass.mockReturnValue({ isPending: false, isError: false, data: CLASS } as never);
    mockUseClassRoster.mockReturnValue({
      isPending: false,
      isError: false,
      data: { students: [] },
    } as never);
    render(<ClassDetailScreen classId="c1" />);
    expect(screen.getByRole('heading', { name: 'SS2A' })).toBeInTheDocument();
    expect(screen.getByText('SS2')).toBeInTheDocument();
    expect(screen.getByText('2026/2027')).toBeInTheDocument();
  });

  it('Students tab is the default and shows an honest empty roster state', () => {
    mockUseClass.mockReturnValue({ isPending: false, isError: false, data: CLASS } as never);
    mockUseClassRoster.mockReturnValue({
      isPending: false,
      isError: false,
      data: { students: [] },
    } as never);
    render(<ClassDetailScreen classId="c1" />);
    expect(screen.getByText('No students enrolled yet')).toBeInTheDocument();
  });

  it("the Teachers tab shows this phase's own gap-closure data", async () => {
    mockUseClass.mockReturnValue({ isPending: false, isError: false, data: CLASS } as never);
    mockUseClassRoster.mockReturnValue({
      isPending: false,
      isError: false,
      data: { students: [] },
    } as never);
    mockUseClassTeachers.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        teachers: [
          {
            assignmentId: 'a1',
            teacherProfileId: 'tp1',
            staffId: 'STF-1',
            displayName: 'Ade Ola',
            subjectId: 'sub1',
            subjectName: 'Mathematics',
            subjectCode: 'MTH',
            startDate: '2026-09-01',
          },
        ],
      },
    } as never);
    render(<ClassDetailScreen classId="c1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Teachers' }));
    expect(screen.getByText('Ade Ola')).toBeInTheDocument();
    expect(screen.getByText(/Mathematics/)).toBeInTheDocument();
  });

  it('the Exams tab shows an honest "not yet available" placeholder, never fabricated data', async () => {
    mockUseClass.mockReturnValue({ isPending: false, isError: false, data: CLASS } as never);
    mockUseClassRoster.mockReturnValue({
      isPending: false,
      isError: false,
      data: { students: [] },
    } as never);
    render(<ClassDetailScreen classId="c1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Exams' }));
    expect(screen.getByText(/aren't available yet/i)).toBeInTheDocument();
  });

  it('the Subjects offered tab lists real offerings via ClassSubjectList', async () => {
    mockUseClass.mockReturnValue({ isPending: false, isError: false, data: CLASS } as never);
    mockUseClassRoster.mockReturnValue({
      isPending: false,
      isError: false,
      data: { students: [] },
    } as never);
    mockUseClassSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        offerings: [
          {
            id: 'cs1',
            classId: 'c1',
            subjectId: 'sub1',
            subjectName: 'Mathematics',
            subjectCode: 'MTH',
            academicSessionId: 's1',
            status: 'ACTIVE',
          },
        ],
      },
    } as never);
    render(<ClassDetailScreen classId="c1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Subjects offered' }));
    expect(screen.getByText(/Mathematics/)).toBeInTheDocument();
  });
});
