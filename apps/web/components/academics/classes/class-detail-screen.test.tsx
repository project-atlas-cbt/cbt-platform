import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { useClassCredentialSheet } from '@/lib/people/mutations';
import { useHasPermission } from '@/lib/nav';
import { NetworkError } from '@/lib/api';

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
vi.mock('@/lib/people/mutations', () => ({ useClassCredentialSheet: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('./class-exams-table', () => ({
  ClassExamsTable: ({ classId }: { classId: string }) => <p>Exams for class {classId}</p>,
}));

const mockUseClass = vi.mocked(useClass);
const mockUseClassRoster = vi.mocked(useClassRoster);
const mockUseClassSubjects = vi.mocked(useClassSubjects);
const mockUseClassTeachers = vi.mocked(useClassTeachers);
const mockUseDepartments = vi.mocked(useDepartments);
const mockUseSession = vi.mocked(useSession);
const mockUseSubjects = vi.mocked(useSubjects);
const mockUseClassCredentialSheet = vi.mocked(useClassCredentialSheet);
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

// `ClassRosterTable` calls `useClassCredentialSheet()` (F7's "Download
// credential sheet" button), mocked below like every other mutation this
// screen uses. Still wrapped in a real `QueryClientProvider`: this is a
// regression guard for a real bug found during review — `useMutation` (and
// any other real TanStack Query hook a future change might add here)
// throws immediately on render without one, whether or not it's mocked at
// the module level, and this file previously had no provider at all.
function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ClassDetailScreen classId="c1" />
    </QueryClientProvider>,
  );
}

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
    mockUseClassCredentialSheet.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading skeleton while the class is loading', () => {
    mockUseClass.mockReturnValue({ isPending: true, isError: false, data: undefined } as never);
    renderScreen();
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
    renderScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows the class header with level/session/status badges', () => {
    mockUseClass.mockReturnValue({ isPending: false, isError: false, data: CLASS } as never);
    mockUseClassRoster.mockReturnValue({
      isPending: false,
      isError: false,
      data: { students: [] },
    } as never);
    renderScreen();
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
    renderScreen();
    expect(screen.getByText('No students enrolled yet')).toBeInTheDocument();
  });

  // Regression test for a real bug found during review: the "Download
  // credential sheet" button called `mutateAsync` fire-and-forget (`void
  // mutateAsync(...)`) with no `.catch()` and no error UI reading the
  // mutation's own `isError`/`error` state — a failed download produced no
  // user-facing feedback at all, just a spinner that silently stopped.
  it('shows an inline error if the credential sheet download fails, instead of failing silently', async () => {
    mockUseClass.mockReturnValue({ isPending: false, isError: false, data: CLASS } as never);
    mockUseClassRoster.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        students: [
          {
            enrollmentId: 'e1',
            studentId: 'ST001',
            displayName: 'Ada Okoye',
            startDate: '2026-09-01',
          },
        ],
      },
    } as never);
    const mutateAsync = vi.fn().mockRejectedValue(new NetworkError());
    mockUseClassCredentialSheet.mockReturnValue({ mutateAsync, isPending: false } as never);

    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: /download credential sheet/i }));

    expect(mutateAsync).toHaveBeenCalledWith('c1');
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
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
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Teachers' }));
    expect(screen.getByText('Ade Ola')).toBeInTheDocument();
    expect(screen.getByText(/Mathematics/)).toBeInTheDocument();
  });

  it('the Exams tab lists the exams for this class', async () => {
    mockUseClass.mockReturnValue({ isPending: false, isError: false, data: CLASS } as never);
    mockUseClassRoster.mockReturnValue({
      isPending: false,
      isError: false,
      data: { students: [] },
    } as never);
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Exams' }));
    expect(screen.getByText('Exams for class c1')).toBeInTheDocument();
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
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Subjects offered' }));
    expect(screen.getByText(/Mathematics/)).toBeInTheDocument();
  });
});
