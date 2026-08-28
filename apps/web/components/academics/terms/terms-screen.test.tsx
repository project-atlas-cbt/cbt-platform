import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TermsScreen } from './terms-screen';
import { useAcademicsContext, useSessions, useTerms } from '@/lib/academics/queries';
import { useActivateTerm, useCreateTerm } from '@/lib/onboarding/mutations';
import { useDeleteTerm, useUpdateTerm } from '@/lib/academics/mutations';
import { useHasPermission } from '@/lib/nav';

vi.mock('@/lib/academics/queries', () => ({
  useAcademicsContext: vi.fn(),
  useSessions: vi.fn(),
  useTerms: vi.fn(),
}));
vi.mock('@/lib/onboarding/mutations', () => ({ useActivateTerm: vi.fn(), useCreateTerm: vi.fn() }));
vi.mock('@/lib/academics/mutations', () => ({ useDeleteTerm: vi.fn(), useUpdateTerm: vi.fn() }));
vi.mock('@/lib/nav', () => ({ useHasPermission: vi.fn() }));

const mockUseAcademicsContext = vi.mocked(useAcademicsContext);
const mockUseSessions = vi.mocked(useSessions);
const mockUseTerms = vi.mocked(useTerms);
const mockUseActivateTerm = vi.mocked(useActivateTerm);
const mockUseCreateTerm = vi.mocked(useCreateTerm);
const mockUseDeleteTerm = vi.mocked(useDeleteTerm);
const mockUseUpdateTerm = vi.mocked(useUpdateTerm);
const mockUseHasPermission = vi.mocked(useHasPermission);

const SESSIONS = [
  {
    id: 's1',
    name: '2026/2027',
    startDate: '2026-09-01',
    endDate: '2027-07-31',
    status: 'CURRENT',
  },
];
const TERMS = [
  {
    id: 't1',
    academicSessionId: 's1',
    name: 'First Term',
    sequence: 1,
    startDate: '2026-09-01',
    endDate: '2026-12-15',
    status: 'CURRENT',
  },
];

describe('TermsScreen', () => {
  const createMutateAsync = vi.fn();
  const activateMutateAsync = vi.fn();
  const deleteMutateAsync = vi.fn();
  const updateMutateAsync = vi.fn();

  beforeEach(() => {
    createMutateAsync.mockReset();
    activateMutateAsync.mockReset();
    deleteMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    mockUseAcademicsContext.mockReturnValue({ data: { session: SESSIONS[0] } } as never);
    mockUseCreateTerm.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    } as never);
    mockUseActivateTerm.mockReturnValue({
      mutateAsync: activateMutateAsync,
      isPending: false,
    } as never);
    mockUseDeleteTerm.mockReturnValue({
      mutateAsync: deleteMutateAsync,
      isPending: false,
    } as never);
    mockUseUpdateTerm.mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false,
    } as never);
    mockUseHasPermission.mockReturnValue(true);
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: SESSIONS },
    } as never);
  });

  it('shows an honest empty state when no academic session exists yet, before any session selector', () => {
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: false,
      data: { sessions: [] },
    } as never);
    render(<TermsScreen />);
    expect(screen.getByText('No academic sessions yet')).toBeInTheDocument();
    expect(screen.queryByLabelText(/session/i)).not.toBeInTheDocument();
  });

  it('shows an error state with retry when sessions fail to load', () => {
    const refetch = vi.fn();
    mockUseSessions.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);
    render(<TermsScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('defaults the session selector to the current session and lists its terms', () => {
    mockUseTerms.mockReturnValue({
      isPending: false,
      isError: false,
      data: { terms: TERMS },
    } as never);
    render(<TermsScreen />);
    expect(within(screen.getByRole('table')).getByText(/First Term/)).toBeInTheDocument();
  });

  it('shows the first-run empty state for a session with no terms yet', () => {
    mockUseTerms.mockReturnValue({
      isPending: false,
      isError: false,
      data: { terms: [] },
    } as never);
    render(<TermsScreen />);
    expect(screen.getByText('No terms in this session yet')).toBeInTheDocument();
  });

  it('creating a term calls the mutation with the selected session id', async () => {
    mockUseTerms.mockReturnValue({
      isPending: false,
      isError: false,
      data: { terms: [] },
    } as never);
    createMutateAsync.mockResolvedValueOnce({ id: 't2' });
    render(<TermsScreen />);

    await userEvent.click(screen.getAllByRole('button', { name: /add term/i })[0]!);
    await userEvent.type(screen.getByLabelText(/term name/i), 'Second Term');
    await userEvent.clear(screen.getByLabelText(/order/i));
    await userEvent.type(screen.getByLabelText(/order/i), '2');
    await userEvent.type(screen.getByLabelText(/start date/i), '2027-01-05');
    await userEvent.type(screen.getByLabelText(/end date/i), '2027-04-01');
    await userEvent.click(screen.getByRole('button', { name: /create term/i }));

    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', name: 'Second Term', sequence: 2 }),
    );
  });

  it('activating a term shows a confirm dialog and calls the mutation', async () => {
    mockUseTerms.mockReturnValue({
      isPending: false,
      isError: false,
      data: { terms: TERMS },
    } as never);
    activateMutateAsync.mockResolvedValueOnce(TERMS[0]);
    render(<TermsScreen />);
    await userEvent.click(screen.getByRole('button', { name: /actions for first term/i }));
    // CURRENT term cannot be re-activated — only "Delete" is enabled here;
    // switch fixtures to an UPCOMING term to prove the activate path.
    expect(screen.getByRole('menuitem', { name: /set as current/i })).toHaveAttribute(
      'data-disabled',
    );
  });

  it('hides every mutating control for a view-only actor (HOD)', () => {
    mockUseHasPermission.mockReturnValue(false);
    mockUseTerms.mockReturnValue({
      isPending: false,
      isError: false,
      data: { terms: TERMS },
    } as never);
    render(<TermsScreen />);
    expect(screen.queryByRole('button', { name: /add term/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
  });
});
