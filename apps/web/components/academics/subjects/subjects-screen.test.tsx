import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubjectsScreen } from './subjects-screen';
import { useDepartments, useSubjects } from '@/lib/academics/queries';
import { useCreateSubject } from '@/lib/onboarding/mutations';
import {
  useDeactivateSubject,
  useDeleteSubject,
  useUpdateSubject,
} from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({ useDepartments: vi.fn(), useSubjects: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({ useCreateSubject: vi.fn() }));
vi.mock('@/lib/academics/mutations', () => ({
  useDeactivateSubject: vi.fn(),
  useDeleteSubject: vi.fn(),
  useUpdateSubject: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseDepartments = vi.mocked(useDepartments);
const mockUseSubjects = vi.mocked(useSubjects);
const mockUseCreateSubject = vi.mocked(useCreateSubject);
const mockUseDeactivateSubject = vi.mocked(useDeactivateSubject);
const mockUseDeleteSubject = vi.mocked(useDeleteSubject);
const mockUseUpdateSubject = vi.mocked(useUpdateSubject);
const mockUseHasPermission = vi.mocked(useHasPermission);

const SUBJECTS = [
  { id: 'sub1', name: 'Mathematics', code: 'MTH', departmentId: null, status: 'ACTIVE' },
];

describe('SubjectsScreen', () => {
  const createMutateAsync = vi.fn();
  const deactivateMutateAsync = vi.fn();
  const deleteMutateAsync = vi.fn();
  const updateMutateAsync = vi.fn();

  beforeEach(() => {
    createMutateAsync.mockReset();
    deactivateMutateAsync.mockReset();
    deleteMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    mockUseDepartments.mockReturnValue({ data: { departments: [] } } as never);
    mockUseCreateSubject.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    } as never);
    mockUseDeactivateSubject.mockReturnValue({
      mutateAsync: deactivateMutateAsync,
      isPending: false,
    } as never);
    mockUseDeleteSubject.mockReturnValue({
      mutateAsync: deleteMutateAsync,
      isPending: false,
    } as never);
    mockUseUpdateSubject.mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false,
    } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading state while subjects are loading', () => {
    mockUseSubjects.mockReturnValue({ isPending: true, isError: false, data: undefined } as never);
    render(<SubjectsScreen />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry on failure', () => {
    const refetch = vi.fn();
    mockUseSubjects.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<SubjectsScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows the first-run empty state', () => {
    mockUseSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { subjects: [] },
    } as never);
    render(<SubjectsScreen />);
    expect(screen.getByText('No subjects yet')).toBeInTheDocument();
  });

  it('renders real rows', () => {
    mockUseSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { subjects: SUBJECTS },
    } as never);
    render(<SubjectsScreen />);
    expect(within(screen.getByRole('table')).getByText('Mathematics')).toBeInTheDocument();
  });

  it('the create form reflects ADR-0001: a department picker with the review-scope help text (exit criterion)', async () => {
    mockUseSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { subjects: [] },
    } as never);
    render(<SubjectsScreen />);
    await userEvent.click(screen.getAllByRole('button', { name: /add subject/i })[0]!);
    expect(screen.getByText(/department \(optional\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/falls outside every hod.s automatic review scope/i),
    ).toBeInTheDocument();
  });

  it('creating a subject calls the mutation', async () => {
    mockUseSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { subjects: [] },
    } as never);
    createMutateAsync.mockResolvedValueOnce({ id: 'sub2' });
    render(<SubjectsScreen />);

    await userEvent.click(screen.getAllByRole('button', { name: /add subject/i })[0]!);
    await userEvent.type(screen.getByLabelText(/subject name/i), 'Physics');
    await userEvent.type(screen.getByLabelText(/code/i), 'PHY');
    await userEvent.click(screen.getByRole('button', { name: /create subject/i }));

    expect(createMutateAsync).toHaveBeenCalledWith({ name: 'Physics', code: 'PHY' });
  });

  it('deactivating shows a static warning and calls the mutation on confirm', async () => {
    mockUseSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { subjects: SUBJECTS },
    } as never);
    deactivateMutateAsync.mockResolvedValueOnce(SUBJECTS[0]);
    render(<SubjectsScreen />);

    await userEvent.click(screen.getByRole('button', { name: /actions for mathematics/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /deactivate/i }));
    expect(screen.getByText(/historical exam.*stays intact/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^deactivate$/i }));
    expect(deactivateMutateAsync).toHaveBeenCalledWith('sub1');
  });

  it('hides every mutating control for a view-only actor (HOD)', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseSubjects.mockReturnValue({
      isPending: false,
      isError: false,
      data: { subjects: SUBJECTS },
    } as never);
    render(<SubjectsScreen />);
    expect(screen.queryByRole('button', { name: /add subject/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
  });
});
