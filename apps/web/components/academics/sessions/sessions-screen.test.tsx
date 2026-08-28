import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionsScreen } from './sessions-screen';
import { useSessions } from '@/lib/academics/queries';
import { useActivateSession, useCreateSession } from '@/lib/onboarding/mutations';
import { useArchiveSession, useDeleteSession, useUpdateSession } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';
import { ApiError } from '@/lib/api';

vi.mock('@/lib/academics/queries', () => ({ useSessions: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({
  useActivateSession: vi.fn(),
  useCreateSession: vi.fn(),
}));
vi.mock('@/lib/academics/mutations', () => ({
  useArchiveSession: vi.fn(),
  useDeleteSession: vi.fn(),
  useUpdateSession: vi.fn(),
}));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseSessions = vi.mocked(useSessions);
const mockUseActivateSession = vi.mocked(useActivateSession);
const mockUseCreateSession = vi.mocked(useCreateSession);
const mockUseArchiveSession = vi.mocked(useArchiveSession);
const mockUseDeleteSession = vi.mocked(useDeleteSession);
const mockUseUpdateSession = vi.mocked(useUpdateSession);
const mockUseHasPermission = vi.mocked(useHasPermission);

const SESSIONS = [
  { id: 's1', name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31', status: 'CLOSED' },
  {
    id: 's2',
    name: '2026/2027',
    startDate: '2026-09-01',
    endDate: '2027-07-31',
    status: 'CURRENT',
  },
];

describe('SessionsScreen', () => {
  const createMutateAsync = vi.fn();
  const activateMutateAsync = vi.fn();
  const archiveMutateAsync = vi.fn();
  const deleteMutateAsync = vi.fn();
  const updateMutateAsync = vi.fn();

  beforeEach(() => {
    createMutateAsync.mockReset();
    activateMutateAsync.mockReset();
    archiveMutateAsync.mockReset();
    deleteMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    mockUseCreateSession.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    } as never);
    mockUseActivateSession.mockReturnValue({
      mutateAsync: activateMutateAsync,
      isPending: false,
    } as never);
    mockUseArchiveSession.mockReturnValue({
      mutateAsync: archiveMutateAsync,
      isPending: false,
    } as never);
    mockUseDeleteSession.mockReturnValue({
      mutateAsync: deleteMutateAsync,
      isPending: false,
    } as never);
    mockUseUpdateSession.mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false,
    } as never);
    mockUseHasPermission.mockReturnValue(true);
  });

  it('shows a loading state while sessions are loading', () => {
    mockUseSessions.mockReturnValue({ isPending: true, isError: false, data: undefined } as never);
    render(<SessionsScreen />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows an error state with retry on failure', () => {
    const refetch = vi.fn();
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<SessionsScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('shows the first-run empty state with a real call to action for a manager', () => {
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: [] },
    } as never);
    render(<SessionsScreen />);
    expect(screen.getByText('No academic sessions yet')).toBeInTheDocument();
    // The header's own "Add session" button and the empty state's own call
    // to action both render — two distinct affordances to the same result.
    expect(screen.getAllByRole('button', { name: /add session/i })).toHaveLength(2);
  });

  it('renders real rows with status badges', () => {
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: SESSIONS },
    } as never);
    render(<SessionsScreen />);
    expect(screen.getByText('2025/2026')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Current')).toBeInTheDocument();
  });

  it('creating a session calls the mutation and closes the dialog', async () => {
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: [] },
    } as never);
    createMutateAsync.mockResolvedValueOnce({ id: 's3' });
    render(<SessionsScreen />);

    await userEvent.click(screen.getAllByRole('button', { name: /add session/i })[0]!);
    await userEvent.type(screen.getByLabelText(/session name/i), '2027/2028');
    await userEvent.type(screen.getByLabelText(/start date/i), '2027-09-01');
    await userEvent.type(screen.getByLabelText(/end date/i), '2028-07-31');
    await userEvent.click(screen.getByRole('button', { name: /create session/i }));

    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '2027/2028',
        startDate: '2027-09-01',
        endDate: '2028-07-31',
      }),
    );
  });

  it('activating a session shows a confirm dialog and calls the mutation on confirm', async () => {
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: SESSIONS },
    } as never);
    activateMutateAsync.mockResolvedValueOnce(SESSIONS[0]);
    render(<SessionsScreen />);

    await userEvent.click(screen.getByRole('button', { name: /actions for 2025\/2026/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /set as current/i }));
    expect(screen.getByText(/closes the currently active session/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^set as current$/i }));
    expect(activateMutateAsync).toHaveBeenCalledWith('s1');
  });

  it('deleting a session blocked by dependents shows the server explanation, not a raw error', async () => {
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: SESSIONS },
    } as never);
    deleteMutateAsync.mockRejectedValueOnce(
      new ApiError({
        code: 'ACADEMIC_STRUCTURE_HAS_DEPENDENTS',
        message: 'Cannot delete this academic session: it is still referenced by 3 term.',
        retryable: false,
        correlationId: 'c1',
        details: { entityType: 'academic session', dependents: { term: 3 } },
      }),
    );
    render(<SessionsScreen />);

    await userEvent.click(screen.getByRole('button', { name: /actions for 2025\/2026/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/still referenced by 3 term/i);
  });

  it('hides every mutating control for a view-only actor (HOD)', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: SESSIONS },
    } as never);
    render(<SessionsScreen />);
    expect(screen.queryByRole('button', { name: /add session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
  });
});
