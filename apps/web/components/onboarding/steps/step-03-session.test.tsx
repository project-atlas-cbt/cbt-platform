import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step03Session } from './step-03-session';
import { useSessions } from '@/lib/onboarding/queries';
import { useActivateSession, useCreateSession } from '@/lib/onboarding/mutations';

vi.mock('@/lib/onboarding/queries', () => ({ useSessions: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({
  useCreateSession: vi.fn(),
  useActivateSession: vi.fn(),
}));

describe('Step03Session', () => {
  const createMutateAsync = vi.fn();
  const activateMutateAsync = vi.fn();

  beforeEach(() => {
    createMutateAsync.mockReset();
    activateMutateAsync.mockReset();
    vi.mocked(useCreateSession).mockReturnValue({ mutateAsync: createMutateAsync } as never);
    vi.mocked(useActivateSession).mockReturnValue({ mutateAsync: activateMutateAsync } as never);
  });

  it('shows an empty list when no sessions exist yet', () => {
    vi.mocked(useSessions).mockReturnValue({ data: { sessions: [] }, isPending: false } as never);
    render(<Step03Session />);
    expect(screen.getByText(/no sessions added yet/i)).toBeInTheDocument();
  });

  it('creates a session and activates it by default (make current checked)', async () => {
    vi.mocked(useSessions).mockReturnValue({ data: { sessions: [] }, isPending: false } as never);
    createMutateAsync.mockResolvedValueOnce({ id: 'sess1', name: '2026/2027', status: 'DRAFT' });
    render(<Step03Session />);
    await userEvent.type(screen.getByLabelText(/session name/i), '2026/2027');
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-09-01');
    await userEvent.type(screen.getByLabelText(/end date/i), '2027-07-31');
    await userEvent.click(screen.getByRole('button', { name: /add session/i }));
    expect(createMutateAsync).toHaveBeenCalledWith({
      name: '2026/2027',
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    expect(activateMutateAsync).toHaveBeenCalledWith('sess1');
  });

  it('does not activate when "make current" is unchecked', async () => {
    vi.mocked(useSessions).mockReturnValue({ data: { sessions: [] }, isPending: false } as never);
    createMutateAsync.mockResolvedValueOnce({ id: 'sess1', name: '2026/2027', status: 'DRAFT' });
    render(<Step03Session />);
    await userEvent.click(screen.getByLabelText(/make this the current session/i));
    await userEvent.type(screen.getByLabelText(/session name/i), '2026/2027');
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-09-01');
    await userEvent.type(screen.getByLabelText(/end date/i), '2027-07-31');
    await userEvent.click(screen.getByRole('button', { name: /add session/i }));
    expect(createMutateAsync).toHaveBeenCalled();
    expect(activateMutateAsync).not.toHaveBeenCalled();
  });

  it('lists existing sessions with a status badge', () => {
    vi.mocked(useSessions).mockReturnValue({
      data: { sessions: [{ id: 's1', name: '2025/2026', status: 'CURRENT' }] },
      isPending: false,
    } as never);
    render(<Step03Session />);
    expect(screen.getByText('2025/2026')).toBeInTheDocument();
    expect(screen.getByText('CURRENT')).toBeInTheDocument();
  });
});
