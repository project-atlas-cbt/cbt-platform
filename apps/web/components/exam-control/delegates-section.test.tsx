import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHasPermission } from '@/lib/nav';
import { useExamAdministrators } from '@/lib/exam-control/queries';
import {
  useAssignExamAdministrator,
  useRevokeExamAdministrator,
} from '@/lib/exam-control/mutations';
import { useTeachersPaginated } from '@/lib/people/queries';
import { DelegatesSection } from './delegates-section';

vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));
vi.mock('@/lib/exam-control/queries', () => ({ useExamAdministrators: vi.fn() }));
vi.mock('@/lib/exam-control/mutations', () => ({
  useAssignExamAdministrator: vi.fn(),
  useRevokeExamAdministrator: vi.fn(),
}));
vi.mock('@/lib/people/queries', () => ({ useTeachersPaginated: vi.fn() }));

const mockUseHasPermission = vi.mocked(useHasPermission);
const mockUseExamAdministrators = vi.mocked(useExamAdministrators);
const mockUseAssign = vi.mocked(useAssignExamAdministrator);
const mockUseRevoke = vi.mocked(useRevokeExamAdministrator);
const mockUseTeachersPaginated = vi.mocked(useTeachersPaginated);

describe('DelegatesSection', () => {
  beforeEach(() => {
    mockUseTeachersPaginated.mockReturnValue({
      data: { teachers: [{ membershipId: 'm2', displayName: 'Bola Ige', staffId: 'STF-002' }] },
    } as never);
    mockUseAssign.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    mockUseRevoke.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  });

  it('is entirely hidden when the actor lacks exam.manageAdministrators — correctly excludes a delegate viewing "their own" exam', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseExamAdministrators.mockReturnValue({ data: { administrators: [] } } as never);
    const { container } = render(<DelegatesSection examId="e1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists an active delegate with a Revoke action', () => {
    mockUseHasPermission.mockReturnValue(true);
    mockUseExamAdministrators.mockReturnValue({
      data: {
        administrators: [
          { id: 'a1', membershipId: 'm2', memberName: 'Bola Ige', status: 'ACTIVE' },
        ],
      },
      isPending: false,
      isError: false,
    } as never);
    render(<DelegatesSection examId="e1" />);
    expect(screen.getByText('Bola Ige')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revoke/i })).toBeInTheDocument();
  });

  it('a revoked delegation is still listed, never dropped, with no Revoke action', () => {
    mockUseHasPermission.mockReturnValue(true);
    mockUseExamAdministrators.mockReturnValue({
      data: {
        administrators: [
          { id: 'a1', membershipId: 'm2', memberName: 'Bola Ige', status: 'REVOKED' },
        ],
      },
      isPending: false,
      isError: false,
    } as never);
    render(<DelegatesSection examId="e1" />);
    expect(screen.getByText('Bola Ige')).toBeInTheDocument();
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^revoke$/i })).not.toBeInTheDocument();
  });

  it('opens the assign dialog and submits a new delegate', async () => {
    mockUseHasPermission.mockReturnValue(true);
    mockUseExamAdministrators.mockReturnValue({
      data: { administrators: [] },
      isPending: false,
      isError: false,
    } as never);
    const assign = vi.fn().mockResolvedValue(undefined);
    mockUseAssign.mockReturnValue({ mutateAsync: assign, isPending: false } as never);

    render(<DelegatesSection examId="e1" />);
    await userEvent.click(screen.getByRole('button', { name: /add delegate/i }));
    await userEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    await userEvent.click(within(listbox).getByText(/bola ige/i));
    await userEvent.click(screen.getByRole('button', { name: /^add delegate$/i }));
    expect(assign).toHaveBeenCalledWith('m2');
  });
});
