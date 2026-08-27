import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchoolOverviewPage from './page';
import { useSchool } from '@/lib/platform/queries';
import {
  useSuspendSchool,
  useReactivateSchool,
  useDeactivateSchool,
} from '@/lib/platform/mutations';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }) }));
vi.mock('@/lib/platform/queries', () => ({ useSchool: vi.fn() }));
vi.mock('@/lib/platform/mutations', () => ({
  useSuspendSchool: vi.fn(),
  useReactivateSchool: vi.fn(),
  useDeactivateSchool: vi.fn(),
}));

const mockUseSchool = vi.mocked(useSchool);
const mockUseSuspend = vi.mocked(useSuspendSchool);
const mockUseReactivate = vi.mocked(useReactivateSchool);
const mockUseDeactivate = vi.mocked(useDeactivateSchool);

function school(overrides: Partial<{ status: string }> = {}) {
  return {
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
    data: {
      id: 's1',
      name: 'Greenfield College',
      subdomain: 'greenfield',
      status: 'ACTIVE',
      shortName: null,
      contactEmail: null,
      contactPhone: null,
      timezone: 'Africa/Lagos',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    },
  };
}

describe('SchoolOverviewPage', () => {
  const suspendMutate = vi.fn();
  const reactivateMutate = vi.fn();
  const deactivateMutate = vi.fn();

  beforeEach(() => {
    suspendMutate.mockReset();
    reactivateMutate.mockReset();
    deactivateMutate.mockReset();
    mockUseSuspend.mockReturnValue({ mutateAsync: suspendMutate } as never);
    mockUseReactivate.mockReturnValue({ mutateAsync: reactivateMutate } as never);
    mockUseDeactivate.mockReturnValue({ mutateAsync: deactivateMutate } as never);
  });

  it('only enables Suspend for an ACTIVE school', () => {
    mockUseSchool.mockReturnValue(school({ status: 'ACTIVE' }) as never);
    render(<SchoolOverviewPage />);
    expect(screen.getByRole('button', { name: /suspend school/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /reactivate school/i })).toBeDisabled();
  });

  it('only enables Reactivate for a SUSPENDED school', () => {
    mockUseSchool.mockReturnValue(school({ status: 'SUSPENDED' }) as never);
    render(<SchoolOverviewPage />);
    expect(screen.getByRole('button', { name: /reactivate school/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /suspend school/i })).toBeDisabled();
  });

  it('disables Deactivate for an already-DEACTIVATED (terminal) school', () => {
    mockUseSchool.mockReturnValue(school({ status: 'DEACTIVATED' }) as never);
    render(<SchoolOverviewPage />);
    expect(screen.getByRole('button', { name: /deactivate school/i })).toBeDisabled();
  });

  it('suspending requires a reason and calls the mutation with it — never optimistic', async () => {
    mockUseSchool.mockReturnValue(school({ status: 'ACTIVE' }) as never);
    suspendMutate.mockResolvedValueOnce(undefined);
    render(<SchoolOverviewPage />);

    await userEvent.click(screen.getByRole('button', { name: /suspend school/i }));
    // Scoped to the dialog itself — the page's own trigger button (outside
    // the dialog) shares the same accessible name, so indexing into a flat
    // getAllByRole list is fragile; `within` the dialog is unambiguous.
    const dialog = screen.getByRole('dialog');
    const dialogConfirm = () => within(dialog).getByRole('button', { name: /suspend school/i });
    // `fireEvent` (not `userEvent`) for interactions *inside* the dialog:
    // jsdom has no real layout/stylesheet engine, so Radix's modal focus/
    // pointer-event handling — which relies on realistic pointer-down/up
    // sequencing to distinguish an inside click from an outside dismiss —
    // behaves unreliably under `userEvent`'s simulated pointer here. A
    // plain click event is all the form's own submit handler needs.
    fireEvent.click(dialogConfirm());
    expect(await screen.findByText(/a reason is required/i)).toBeInTheDocument();
    expect(suspendMutate).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/reason/i), {
      target: { value: 'Non-payment' },
    });
    fireEvent.click(dialogConfirm());
    await waitFor(() => expect(suspendMutate).toHaveBeenCalledWith('Non-payment'));
  });
});
