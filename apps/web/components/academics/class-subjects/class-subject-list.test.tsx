import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassSubjectList } from './class-subject-list';
import { useClassSubjects, useStreams, useSubjects } from '@/lib/academics/queries';
import {
  useAddClassSubject,
  useRemoveClassSubject,
  useSetClassSubjectKind,
} from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({
  useClassSubjects: vi.fn(),
  useSubjects: vi.fn(),
  useStreams: vi.fn(() => ({ data: { streams: [] }, isSuccess: true, isPending: false })),
}));
vi.mock('@/lib/academics/mutations', () => ({
  useAddClassSubject: vi.fn(),
  useRemoveClassSubject: vi.fn(),
  useSetClassSubjectKind: vi.fn(),
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
    kind: 'COMPULSORY',
    streamIds: [],
    streamNames: [],
  },
];

describe('ClassSubjectList', () => {
  const addMutateAsync = vi.fn();
  const removeMutateAsync = vi.fn();
  const kindMutateAsync = vi.fn();

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
    kindMutateAsync.mockReset().mockResolvedValue({});
    vi.mocked(useSetClassSubjectKind).mockReturnValue({
      mutateAsync: kindMutateAsync,
      isPending: false,
    } as never);
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
    expect(addMutateAsync).toHaveBeenCalledWith({
      subjectId: 'sub1',
      kind: 'COMPULSORY',
      streamIds: [],
    });
  });

  it('offers a subject to everyone in a stream (ADR-0038)', async () => {
    vi.mocked(useStreams).mockReturnValue({
      data: {
        streams: [
          { id: 'st1', name: 'Science', code: 'SCI', status: 'ACTIVE' },
          { id: 'st2', name: 'Business', code: 'BUS', status: 'ACTIVE' },
          { id: 'st3', name: 'Old', code: 'OLD', status: 'INACTIVE' },
        ],
      },
    } as never);
    mockUseClassSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { offerings: OFFERINGS },
    } as never);
    render(<ClassSubjectList classId="c1" />);

    await userEvent.click(screen.getByRole('button', { name: /who takes mathematics/i }));
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Old' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Science' }));
    expect(kindMutateAsync).toHaveBeenCalledWith({
      id: 'cs1',
      kind: 'ELECTIVE',
      streamIds: ['st1'],
    });
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
