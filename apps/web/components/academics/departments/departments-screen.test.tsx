import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DepartmentsScreen } from './departments-screen';
import { useDepartments } from '@/lib/academics/queries';
import { useCreateDepartment, useDeactivateDepartment } from '@/lib/onboarding/mutations';
import { useDeleteDepartment, useUpdateDepartment } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({ useDepartments: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({
  useCreateDepartment: vi.fn(),
  useDeactivateDepartment: vi.fn(),
}));
vi.mock('@/lib/academics/mutations', () => ({
  useDeleteDepartment: vi.fn(),
  useUpdateDepartment: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseDepartments = vi.mocked(useDepartments);
const mockUseCreateDepartment = vi.mocked(useCreateDepartment);
const mockUseDeactivateDepartment = vi.mocked(useDeactivateDepartment);
const mockUseDeleteDepartment = vi.mocked(useDeleteDepartment);
const mockUseUpdateDepartment = vi.mocked(useUpdateDepartment);
const mockUseHasPermission = vi.mocked(useHasPermission);

const DEPARTMENTS = [{ id: 'd1', name: 'Sciences', code: 'SCI', status: 'ACTIVE' }];

describe('DepartmentsScreen', () => {
  const createMutateAsync = vi.fn();
  const deactivateMutateAsync = vi.fn();
  const deleteMutateAsync = vi.fn();
  const updateMutateAsync = vi.fn();

  beforeEach(() => {
    createMutateAsync.mockReset();
    deactivateMutateAsync.mockReset();
    deleteMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    mockUseCreateDepartment.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    } as never);
    mockUseDeactivateDepartment.mockReturnValue({
      mutateAsync: deactivateMutateAsync,
      isPending: false,
    } as never);
    mockUseDeleteDepartment.mockReturnValue({
      mutateAsync: deleteMutateAsync,
      isPending: false,
    } as never);
    mockUseUpdateDepartment.mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false,
    } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading state while departments are loading', () => {
    mockUseDepartments.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    } as never);
    render(<DepartmentsScreen basePath="/school/academics" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry on failure', () => {
    const refetch = vi.fn();
    mockUseDepartments.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<DepartmentsScreen basePath="/school/academics" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows the first-run empty state', () => {
    mockUseDepartments.mockReturnValue({
      isPending: false,
      isError: false,
      data: { departments: [] },
    } as never);
    render(<DepartmentsScreen basePath="/school/academics" />);
    expect(screen.getByText('No departments yet')).toBeInTheDocument();
  });

  it('renders real rows linking to the department detail route', () => {
    mockUseDepartments.mockReturnValue({
      isPending: false,
      isError: false,
      data: { departments: DEPARTMENTS },
    } as never);
    render(<DepartmentsScreen basePath="/school/academics" />);
    expect(screen.getByRole('link', { name: 'Sciences' })).toHaveAttribute(
      'href',
      '/school/academics/departments/d1',
    );
    expect(within(screen.getByRole('table')).getByText('Active')).toBeInTheDocument();
  });

  it('creating a department calls the mutation', async () => {
    mockUseDepartments.mockReturnValue({
      isPending: false,
      isError: false,
      data: { departments: [] },
    } as never);
    createMutateAsync.mockResolvedValueOnce({ id: 'd2' });
    render(<DepartmentsScreen basePath="/school/academics" />);

    await userEvent.click(screen.getAllByRole('button', { name: /add department/i })[0]!);
    await userEvent.type(screen.getByLabelText(/department name/i), 'Arts');
    await userEvent.type(screen.getByLabelText(/code/i), 'ART');
    await userEvent.click(screen.getByRole('button', { name: /create department/i }));

    expect(createMutateAsync).toHaveBeenCalledWith({ name: 'Arts', code: 'ART' });
  });

  it('deactivating shows a static warning and calls the mutation on confirm', async () => {
    mockUseDepartments.mockReturnValue({
      isPending: false,
      isError: false,
      data: { departments: DEPARTMENTS },
    } as never);
    deactivateMutateAsync.mockResolvedValueOnce(DEPARTMENTS[0]);
    render(<DepartmentsScreen basePath="/school/academics" />);

    await userEvent.click(screen.getByRole('button', { name: /actions for sciences/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /deactivate/i }));
    expect(screen.getByText(/preserved/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^deactivate$/i }));
    expect(deactivateMutateAsync).toHaveBeenCalledWith('d1');
  });

  it('hides every mutating control for a view-only actor (HOD)', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseDepartments.mockReturnValue({
      isPending: false,
      isError: false,
      data: { departments: DEPARTMENTS },
    } as never);
    render(<DepartmentsScreen basePath="/hod/academics" />);
    expect(screen.queryByRole('button', { name: /add department/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
    // Read access itself is preserved — the department name still links.
    expect(screen.getByRole('link', { name: 'Sciences' })).toBeInTheDocument();
  });
});
