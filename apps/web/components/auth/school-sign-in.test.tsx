import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchoolSignIn } from './school-sign-in';

const state = vi.hoisted(() => ({
  school: { studentPasswordlessSignIn: false },
  studentSignIn: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock('@/lib/tenant', () => ({
  useTenant: () => ({ status: 'resolved', school: state.school }),
}));
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  useAuth: () => ({ login: vi.fn(), studentSignIn: state.studentSignIn }),
}));

describe('SchoolSignIn', () => {
  it('shows only the password form while passwordless sign-in is off', () => {
    state.school = { studentPasswordlessSignIn: false };
    render(<SchoolSignIn />);
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
  });

  it('offers students name + Login ID first while it is on, with a way back to passwords', async () => {
    state.school = { studentPasswordlessSignIn: true };
    state.studentSignIn.mockResolvedValue(undefined);
    render(<SchoolSignIn />);
    await userEvent.type(screen.getByLabelText('Your name'), 'Funmilayo Adebayo');
    await userEvent.type(screen.getByLabelText('Login ID'), 'OLA/001');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(state.studentSignIn).toHaveBeenCalledWith('OLA/001', 'Funmilayo Adebayo');
    expect(state.replace).toHaveBeenCalledWith('/');

    await userEvent.click(screen.getByRole('button', { name: /sign in with a password/i }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});
