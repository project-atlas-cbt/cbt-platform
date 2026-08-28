import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DepartmentDetailScreen } from './department-detail-screen';
import { useDepartment, useDepartmentHodAssignments, useHods } from '@/lib/academics/queries';
import { useCreateDepartment, useDeactivateDepartment } from '@/lib/onboarding/mutations';
import { useDeleteDepartment, useUpdateDepartment } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({
  useDepartment: vi.fn(),
  useDepartmentHodAssignments: vi.fn(),
  useHods: vi.fn(),
}));
vi.mock('@/lib/onboarding/mutations', () => ({
  useCreateDepartment: vi.fn(),
  useDeactivateDepartment: vi.fn(),
}));
vi.mock('@/lib/academics/mutations', () => ({
  useDeleteDepartment: vi.fn(),
  useUpdateDepartment: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseDepartment = vi.mocked(useDepartment);
const mockUseDepartmentHodAssignments = vi.mocked(useDepartmentHodAssignments);
const mockUseHods = vi.mocked(useHods);
const mockUseHasPermission = vi.mocked(useHasPermission);

const DEPARTMENT = { id: 'd1', name: 'Sciences', code: 'SCI', status: 'ACTIVE' };
const ACTIVE_ASSIGNMENT = {
  id: 'ha1',
  membershipId: 'm1',
  departmentId: 'd1',
  academicSessionId: 's1',
  startDate: '2026-09-01',
  endDate: null,
  status: 'ACTIVE',
};

describe('DepartmentDetailScreen', () => {
  beforeEach(() => {
    vi.mocked(useCreateDepartment).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(useDeactivateDepartment).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(useDeleteDepartment).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    vi.mocked(useUpdateDepartment).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    mockUseHods.mockReturnValue({
      data: { hods: [{ membershipId: 'm1', displayName: 'Ada Obi' }] },
    } as never);
  });

  it('shows a loading skeleton while the department is loading', () => {
    mockUseDepartment.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    } as never);
    mockUseDepartmentHodAssignments.mockReturnValue({ isPending: true, data: undefined } as never);
    render(<DepartmentDetailScreen departmentId="d1" />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry on failure', () => {
    const refetch = vi.fn();
    mockUseDepartment.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    mockUseDepartmentHodAssignments.mockReturnValue({
      isPending: false,
      data: { assignments: [] },
    } as never);
    render(<DepartmentDetailScreen departmentId="d1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('resolves and shows the real HOD name for a School Admin viewer (users.hod.view granted)', () => {
    mockUseHasPermission.mockImplementation(
      (id) => id === 'schoolConfig.department.manage' || id === 'users.hod.view',
    );
    mockUseDepartment.mockReturnValue({
      isPending: false,
      isError: false,
      data: DEPARTMENT,
    } as never);
    mockUseDepartmentHodAssignments.mockReturnValue({
      isPending: false,
      data: { assignments: [ACTIVE_ASSIGNMENT] },
    } as never);
    render(<DepartmentDetailScreen departmentId="d1" />);
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
  });

  it('shows a name-less "HOD position filled" status for an HOD viewer (users.hod.view denied — confirmed decision #2)', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseDepartment.mockReturnValue({
      isPending: false,
      isError: false,
      data: DEPARTMENT,
    } as never);
    mockUseDepartmentHodAssignments.mockReturnValue({
      isPending: false,
      data: { assignments: [ACTIVE_ASSIGNMENT] },
    } as never);
    render(<DepartmentDetailScreen departmentId="d1" />);
    expect(screen.getByText('HOD position filled')).toBeInTheDocument();
    expect(screen.queryByText('Ada Obi')).not.toBeInTheDocument();
    expect(screen.getByText(/manage from people/i)).toBeInTheDocument();
  });

  it('shows an honest "no one assigned" state when the department has no active HOD', () => {
    mockUseHasPermission.mockReturnValue(true);
    mockUseDepartment.mockReturnValue({
      isPending: false,
      isError: false,
      data: DEPARTMENT,
    } as never);
    mockUseDepartmentHodAssignments.mockReturnValue({
      isPending: false,
      data: { assignments: [] },
    } as never);
    render(<DepartmentDetailScreen departmentId="d1" />);
    expect(screen.getByText(/no one is currently assigned/i)).toBeInTheDocument();
  });

  it('shows no Edit button and no assign/reassign form for a view-only actor (HOD) — decision #4', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseDepartment.mockReturnValue({
      isPending: false,
      isError: false,
      data: DEPARTMENT,
    } as never);
    mockUseDepartmentHodAssignments.mockReturnValue({
      isPending: false,
      data: { assignments: [] },
    } as never);
    render(<DepartmentDetailScreen departmentId="d1" />);
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign/i })).not.toBeInTheDocument();
  });

  it('School Admin can open the edit dialog', async () => {
    mockUseHasPermission.mockReturnValue(true);
    mockUseDepartment.mockReturnValue({
      isPending: false,
      isError: false,
      data: DEPARTMENT,
    } as never);
    mockUseDepartmentHodAssignments.mockReturnValue({
      isPending: false,
      data: { assignments: [] },
    } as never);
    render(<DepartmentDetailScreen departmentId="d1" />);
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sciences')).toBeInTheDocument();
  });
});
