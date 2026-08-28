import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassSubjectList } from './class-subject-list';
import { useClassSubjects, useSubjects } from '@/lib/academics/queries';
import { useAddClassSubject, useRemoveClassSubject } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({ useClassSubjects: vi.fn(), useSubjects: vi.fn() }));
vi.mock('@/lib/academics/mutations', () => ({
  useAddClassSubject: vi.fn(),
  useRemoveClassSubject: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseClassSubjects = vi.mocked(useClassSubjects);
const mockUseSubjects = vi.mocked(useSubjects);
const mockUseAddClassSubject = vi.mocked(useAddClassSubject);
const mockUseRemoveClassSubject = vi.mocked(useRemoveClassSubject);
const mockUseHasPermission = vi.mocked(useHasPermission);

const SUBJECTS = [
  { id: 'sub1', name: 'Mathematics', code: 'MTH', departmentId: null, status: 'ACTIVE' },
  { id: 'sub2', name: 'Physics', code: 'PHY', departmentId: null, status: 'ACTIVE' },
];
const OFFERINGS = [
  {
    id: 'cs1',
    classId: 'c1',
    subjectId: 'sub1',
    subjectName: 'Mathematics',
    subjectCode: 'MTH',
    academicSessionId: 's1',
    status: 'ACTIVE',
  },
];

describe('ClassSubjectList', () => {
  const addMutateAsync = vi.fn();
  const removeMutateAsync = vi.fn();

  beforeEach(() => {
    addMutateAsync.mockReset();
    removeMutateAsync.mockReset();
    mockUseAddClassSubject.mockReturnValue({
      mutateAsync: addMutateAsync,
      isPending: false,
    } as never);
    mockUseRemoveClassSubject.mockReturnValue({
      mutateAsync: removeMutateAsync,
      isPending: false,
    } as never);
    mockUseSubjects.mockReturnValue({ data: { subjects: SUBJECTS } } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading skeleton while offerings are loading', () => {
    mockUseClassSubjects.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    } as never);
    render(<ClassSubjectList classId="c1" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry on failure', () => {
    const refetch = vi.fn();
    mockUseClassSubjects.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<ClassSubjectList classId="c1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows the first-run empty state', () => {
    mockUseClassSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { offerings: [] },
    } as never);
    render(<ClassSubjectList classId="c1" />);
    expect(screen.getByText('No subjects offered yet')).toBeInTheDocument();
  });

  it('lists offerings and excludes already-offered subjects from the add selector', async () => {
    mockUseClassSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { offerings: OFFERINGS },
    } as never);
    render(<ClassSubjectList classId="c1" />);
    expect(screen.getByText(/Mathematics/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: /choose a subject/i }));
    expect(screen.queryByRole('option', { name: 'Mathematics' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Physics' })).toBeInTheDocument();
  });

  it('offering a subject calls the mutation', async () => {
    mockUseClassSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { offerings: [] },
    } as never);
    addMutateAsync.mockResolvedValueOnce(OFFERINGS[0]);
    render(<ClassSubjectList classId="c1" />);

    await userEvent.click(screen.getByRole('combobox', { name: /choose a subject/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Mathematics' }));
    await userEvent.click(screen.getByRole('button', { name: /offer subject/i }));
    expect(addMutateAsync).toHaveBeenCalledWith('sub1');
  });

  it('removing an offering shows a confirm dialog and calls the mutation', async () => {
    mockUseClassSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { offerings: OFFERINGS },
    } as never);
    removeMutateAsync.mockResolvedValueOnce(undefined);
    render(<ClassSubjectList classId="c1" />);

    await userEvent.click(screen.getByRole('button', { name: /remove mathematics/i }));
    expect(screen.getByText(/remove "mathematics" from this class/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    expect(removeMutateAsync).toHaveBeenCalledWith('cs1');
  });

  it('hides the offer control and remove buttons for a view-only actor (HOD)', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseClassSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { offerings: OFFERINGS },
    } as never);
    render(<ClassSubjectList classId="c1" />);
    expect(screen.queryByRole('combobox', { name: /choose a subject/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove mathematics/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Mathematics/)).toBeInTheDocument();
  });
});
