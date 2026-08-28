import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step04Terms } from './step-04-terms';
import { useAcademicsContext, useTerms } from '@/lib/onboarding/queries';
import { useActivateTerm, useCreateTerm } from '@/lib/onboarding/mutations';

vi.mock('@/lib/onboarding/queries', () => ({ useAcademicsContext: vi.fn(), useTerms: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({ useCreateTerm: vi.fn(), useActivateTerm: vi.fn() }));

describe('Step04Terms', () => {
  const createMutateAsync = vi.fn();
  const activateMutateAsync = vi.fn();

  beforeEach(() => {
    createMutateAsync.mockReset();
    activateMutateAsync.mockReset();
    vi.mocked(useCreateTerm).mockReturnValue({ mutateAsync: createMutateAsync } as never);
    vi.mocked(useActivateTerm).mockReturnValue({ mutateAsync: activateMutateAsync } as never);
  });

  it('shows an upstream-empty state when there is no current session', () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: { session: null },
      isPending: false,
    } as never);
    vi.mocked(useTerms).mockReturnValue({ data: undefined, isPending: false } as never);
    render(<Step04Terms />);
    expect(screen.getByText(/no current session yet/i)).toBeInTheDocument();
  });

  it('creates and activates a term against the current session', async () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: { session: { id: 'sess1', name: '2026/2027', status: 'CURRENT' } },
      isPending: false,
    } as never);
    vi.mocked(useTerms).mockReturnValue({ data: { terms: [] }, isPending: false } as never);
    createMutateAsync.mockResolvedValueOnce({ id: 't1', name: 'First Term', status: 'DRAFT' });

    render(<Step04Terms />);
    await userEvent.type(screen.getByLabelText(/term name/i), 'First Term');
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-09-01');
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: /add term/i }));

    expect(createMutateAsync).toHaveBeenCalledWith({
      sessionId: 'sess1',
      name: 'First Term',
      sequence: 1,
      startDate: '2026-09-01',
      endDate: '2026-12-01',
    });
    expect(activateMutateAsync).toHaveBeenCalledWith('t1');
  });
});
