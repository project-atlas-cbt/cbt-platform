import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudentForm } from './student-form';
import { useAcademicsContext, useClasses } from '@/lib/academics/queries';
import { useCreateStudent } from '@/lib/onboarding/mutations';
import { useUpdateStudent } from '@/lib/people/mutations';

vi.mock('@/lib/academics/queries', () => ({ useAcademicsContext: vi.fn(), useClasses: vi.fn() }));
vi.mock('@/lib/onboarding/mutations', () => ({ useCreateStudent: vi.fn() }));
vi.mock('@/lib/people/mutations', () => ({ useUpdateStudent: vi.fn() }));

/**
 * Gap-closure (found via live testing): `POST /students` never set a
 * password at all — the only way to get one was the separate "Reset
 * credentials" action, a required extra step nothing in the create flow
 * ever mentioned. `useCreateStudent` now auto-issues initial credentials as
 * part of the same "Add student" action; this proves the create flow shows
 * them once, and only calls `onSaved` after the admin explicitly
 * acknowledges — never immediately on creation, so the one-time reveal
 * can't be missed by an auto-closing dialog.
 */
describe('StudentForm — create', () => {
  const createMutateAsync = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    createMutateAsync.mockReset();
    onSaved.mockReset();
    vi.mocked(useAcademicsContext).mockReturnValue({
      data: { session: { id: 'sess1', name: '2026/2027', status: 'CURRENT' } },
      isPending: false,
    } as never);
    vi.mocked(useClasses).mockReturnValue({
      data: { classes: [{ id: 'c1', name: 'SS2A', status: 'ACTIVE' }] },
      isPending: false,
    } as never);
    vi.mocked(useCreateStudent).mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false,
    } as never);
    vi.mocked(useUpdateStudent).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
  });

  async function addStudent() {
    render(<StudentForm onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText(/first name/i), 'Ada');
    await userEvent.type(screen.getByLabelText(/surname/i), 'Obi');
    await userEvent.type(screen.getByLabelText(/student id/i), 'ST001');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'SS2A' }, { timeout: 10000 }));
    await userEvent.click(screen.getByRole('button', { name: /add student/i }));
  }

  it('shows the newly issued credentials instead of closing immediately', async () => {
    createMutateAsync.mockResolvedValueOnce({
      studentProfileId: 'sp1',
      credentials: { loginIdentifier: 'ST001', initialPassword: 'Xy7-abcd' },
    });

    await addStudent();

    expect(await screen.findByText('Student added', {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByText('ST001')).toBeInTheDocument();
    expect(screen.getByText('Xy7-abcd')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('only calls onSaved once the admin acknowledges the credentials', async () => {
    createMutateAsync.mockResolvedValueOnce({
      studentProfileId: 'sp1',
      credentials: { loginIdentifier: 'ST001', initialPassword: 'Xy7-abcd' },
    });

    await addStudent();
    await userEvent.click(
      await screen.findByRole('button', { name: /^done$/i }, { timeout: 10000 }),
    );

    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
