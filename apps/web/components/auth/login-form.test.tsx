import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const login = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, useAuth: () => ({ login }) };
});

describe('LoginForm', () => {
  beforeEach(() => {
    login.mockReset();
    replace.mockReset();
  });

  it('shows validation errors for empty fields and never calls login()', async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/enter your username or student id/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('shows one generic error on rejected credentials — DoD item 3', async () => {
    login.mockRejectedValueOnce(new Error('boom'));
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/username or student id/i), 'ST001');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /incorrect username\/id or password/i,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('hands off to "/" on success — root page owns where an authenticated user lands', async () => {
    login.mockResolvedValueOnce(undefined);
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/username or student id/i), 'ST001');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('shows a forgot-password link by default', () => {
    render(<LoginForm />);
    expect(screen.getByRole('link', { name: /forgot your password/i })).toBeInTheDocument();
  });

  it('omits the forgot-password link for the platform login (showForgotPasswordLink=false)', () => {
    render(<LoginForm showForgotPasswordLink={false} />);
    expect(screen.queryByRole('link', { name: /forgot your password/i })).not.toBeInTheDocument();
  });
});
