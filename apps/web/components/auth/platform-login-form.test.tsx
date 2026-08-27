import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlatformLoginForm } from './platform-login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const login = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, usePlatformAuth: () => ({ login }) };
});

describe('PlatformLoginForm', () => {
  beforeEach(() => {
    login.mockReset();
    replace.mockReset();
  });

  it('shows validation errors for empty fields and never calls login()', async () => {
    render(<PlatformLoginForm />);
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/enter your email/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects a malformed email client-side without calling login()', async () => {
    render(<PlatformLoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'irrelevant');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('shows one generic error on rejected credentials — enumeration-resistant, same shape as LoginForm', async () => {
    login.mockRejectedValueOnce(new Error('boom'));
    render(<PlatformLoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect email or password/i);
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects straight to /admin on success — no role-priority hand-off, unlike LoginForm', async () => {
    login.mockResolvedValueOnce(undefined);
    render(<PlatformLoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
  });

  it('has no forgot-password link — no email-backed reset flow exists for a platform account', () => {
    render(<PlatformLoginForm />);
    expect(screen.queryByRole('link', { name: /forgot your password/i })).not.toBeInTheDocument();
  });
});
