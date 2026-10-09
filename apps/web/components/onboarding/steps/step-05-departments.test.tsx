import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step05Departments } from './step-05-departments';
import { useDepartments } from '@/lib/onboarding/queries';
import { useCreateDepartment, useDeactivateDepartment } from '@/lib/onboarding/mutations';

vi.mock('@/lib/onboarding/queries', () => ({ useDepartments: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({
  useCreateDepartment: vi.fn(),
  useDeactivateDepartment: vi.fn(),
}));
vi.mock('@/components/academics/standard-setup/standard-setup-dialog', () => ({
  StandardSetupDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Standard setup preview</div> : null,
}));

describe('Step05Departments', () => {
  const createMutateAsync = vi.fn();
  const deactivateMutate = vi.fn();

  beforeEach(() => {
    createMutateAsync.mockReset();
    deactivateMutate.mockReset();
    vi.mocked(useCreateDepartment).mockReturnValue({ mutateAsync: createMutateAsync } as never);
    vi.mocked(useDeactivateDepartment).mockReturnValue({
      mutate: deactivateMutate,
      isPending: false,
    } as never);
  });

  it('offers the standard setup instead of pre-creating departments (ADR-0038)', async () => {
    vi.mocked(useDepartments).mockReturnValue({
      data: { departments: [] },
      isPending: false,
    } as never);
    render(<Step05Departments />);
    expect(screen.getByText(/no departments added yet/i)).toBeInTheDocument();
    expect(screen.getByText(/mathematics in\s+science/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /use standard setup/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Standard setup preview');
  });

  it('creates a department', async () => {
    vi.mocked(useDepartments).mockReturnValue({
      data: { departments: [] },
      isPending: false,
    } as never);
    render(<Step05Departments />);
    await userEvent.type(screen.getByLabelText(/department name/i), 'Science');
    await userEvent.type(screen.getByLabelText(/code/i), 'SCI');
    await userEvent.click(screen.getByRole('button', { name: /add department/i }));
    expect(createMutateAsync).toHaveBeenCalledWith({ name: 'Science', code: 'SCI' });
  });

  it('offers Deactivate only for an ACTIVE department', () => {
    vi.mocked(useDepartments).mockReturnValue({
      data: {
        departments: [
          { id: 'd1', name: 'Science', code: 'SCI', status: 'ACTIVE' },
          { id: 'd2', name: 'Old Dept', code: 'OLD', status: 'INACTIVE' },
        ],
      },
      isPending: false,
    } as never);
    render(<Step05Departments />);
    expect(screen.getAllByRole('button', { name: /deactivate/i })).toHaveLength(1);
  });
});
