import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step09Students } from './step-09-students';
import { useAcademicsContext, useClasses, useStudents } from '@/lib/onboarding/queries';
import { useCreateStudent } from '@/lib/onboarding/mutations';

vi.mock('@/lib/onboarding/queries', () => ({
  useAcademicsContext: vi.fn(),
  useClasses: vi.fn(),
  useStudents: vi.fn(),
}));
vi.mock('@/lib/onboarding/mutations', () => ({ useCreateStudent: vi.fn() }));

describe('Step09Students', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    vi.mocked(useCreateStudent).mockReturnValue({ mutateAsync } as never);
    vi.mocked(useStudents).mockReturnValue({ data: { students: [] }, isPending: false } as never);
  });

  it('shows an empty-classes state when there is no session or no class yet', () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: { session: null },
      isPending: false,
    } as never);
    vi.mocked(useClasses).mockReturnValue({ data: { classes: [] }, isPending: false } as never);
    render(<Step09Students />);
    expect(screen.getByText(/no classes yet/i)).toBeInTheDocument();
  });

  it('creates the student then enrolls them into the selected class, in sequence', async () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: { session: { id: 'sess1', name: '2026/2027', status: 'CURRENT' } },
      isPending: false,
    } as never);
    vi.mocked(useClasses).mockReturnValue({
      data: { classes: [{ id: 'c1', name: 'SS2A', status: 'ACTIVE' }] },
      isPending: false,
    } as never);
    mutateAsync.mockResolvedValueOnce({
      membershipId: 'm1',
      credentials: { loginIdentifier: 'ST001', initialPassword: 'Xy7-abcd' },
    });

    render(<Step09Students />);
    await userEvent.type(screen.getByLabelText(/first name/i), 'Ada');
    await userEvent.type(screen.getByLabelText(/last name/i), 'Obi');
    await userEvent.type(screen.getByLabelText(/student id/i), 'ST001');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'SS2A' }, { timeout: 10000 }));
    await userEvent.click(screen.getByRole('button', { name: /add student/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      firstName: 'Ada',
      lastName: 'Obi',
      studentId: 'ST001',
      academicSessionId: 'sess1',
      classId: 'c1',
    });
  });

  // Gap-closure (found via live testing): creating a student never showed a
  // password anywhere. `useCreateStudent` now auto-issues initial
  // credentials; this proves the dismissible reveal panel actually renders
  // them.
  it('shows the newly issued credentials after adding a student', async () => {
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: { session: { id: 'sess1', name: '2026/2027', status: 'CURRENT' } },
      isPending: false,
    } as never);
    vi.mocked(useClasses).mockReturnValue({
      data: { classes: [{ id: 'c1', name: 'SS2A', status: 'ACTIVE' }] },
      isPending: false,
    } as never);
    mutateAsync.mockResolvedValueOnce({
      membershipId: 'm1',
      credentials: { loginIdentifier: 'ST001', initialPassword: 'Xy7-abcd' },
    });

    render(<Step09Students />);
    await userEvent.type(screen.getByLabelText(/first name/i), 'Ada');
    await userEvent.type(screen.getByLabelText(/last name/i), 'Obi');
    await userEvent.type(screen.getByLabelText(/student id/i), 'ST001');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'SS2A' }, { timeout: 10000 }));
    await userEvent.click(screen.getByRole('button', { name: /add student/i }));

    expect(
      await screen.findByText('Credentials for ST001', {}, { timeout: 10000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Xy7-abcd')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText('Credentials for ST001')).not.toBeInTheDocument();
  });
});
