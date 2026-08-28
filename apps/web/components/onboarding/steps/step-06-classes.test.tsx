import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step06Classes } from './step-06-classes';
import { useAcademicsContext, useClasses, useDepartments } from '@/lib/onboarding/queries';
import { useCreateClass } from '@/lib/onboarding/mutations';

vi.mock('@/lib/onboarding/queries', () => ({
  useAcademicsContext: vi.fn(),
  useClasses: vi.fn(),
  useDepartments: vi.fn(),
}));
vi.mock('@/lib/onboarding/mutations', () => ({ useCreateClass: vi.fn() }));

describe('Step06Classes', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    vi.mocked(useCreateClass).mockReturnValue({ mutateAsync } as never);
    vi.mocked(useDepartments).mockReturnValue({
      data: { departments: [] },
      isPending: false,
    } as never);
  });

  it('shows an upstream-empty state with no current session', () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: { session: null },
      isPending: false,
    } as never);
    vi.mocked(useClasses).mockReturnValue({ data: undefined, isPending: false } as never);
    render(<Step06Classes />);
    expect(screen.getByText(/no current session yet/i)).toBeInTheDocument();
  });

  it('creates a class against the current session, with no department by default', async () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: { session: { id: 'sess1', name: '2026/2027', status: 'CURRENT' } },
      isPending: false,
    } as never);
    vi.mocked(useClasses).mockReturnValue({ data: { classes: [] }, isPending: false } as never);

    render(<Step06Classes />);
    await userEvent.type(screen.getByLabelText(/arm/i), 'A');
    await userEvent.type(screen.getByLabelText(/class name/i), 'SS2A');
    await userEvent.click(screen.getByRole('button', { name: /add class/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      academicSessionId: 'sess1',
      name: 'SS2A',
      level: 'JSS1',
      arm: 'A',
    });
  });

  it('filters archived classes out of the "added so far" list', () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: { session: { id: 'sess1', name: '2026/2027', status: 'CURRENT' } },
      isPending: false,
    } as never);
    vi.mocked(useClasses).mockReturnValue({
      data: {
        classes: [
          { id: 'c1', name: 'SS2A', level: 'SS2', status: 'ACTIVE' },
          { id: 'c2', name: 'SS2B', level: 'SS2', status: 'ARCHIVED' },
        ],
      },
      isPending: false,
    } as never);
    render(<Step06Classes />);
    expect(screen.getByText('SS2A')).toBeInTheDocument();
    expect(screen.queryByText('SS2B')).not.toBeInTheDocument();
  });
});
