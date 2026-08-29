import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, NetworkError } from '@/lib/api';
import { LoginForm } from './login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const login = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, useAuth: () => ({ login }) };
});

// Defaults to 'resolved' — the CSRF bootstrap having already completed — for
// every test below that isn't specifically exercising the loading-state
// guard. See login-form.tsx's own comment for the race this mock lets us
// simulate both sides of.
let tenantStatus: 'loading' | 'resolved' | 'error' = 'resolved';
vi.mock('@/lib/tenant', () => ({
  useTenant: () => ({ status: tenantStatus, school: null }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    login.mockReset();
    replace.mockReset();
    tenantStatus = 'resolved';
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

  it('disables submission until the CSRF bootstrap resolves — closes a real race that used to surface as "wrong password"', async () => {
    tenantStatus = 'loading';
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/username or student id/i), 'ST001');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(login).not.toHaveBeenCalled();
  });

  it('re-enables submission once the CSRF bootstrap settles', () => {
    tenantStatus = 'resolved';
    render(<LoginForm />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  it('shows a non-login failure (e.g. a CSRF rejection) verbatim instead of the generic credentials message', async () => {
    login.mockRejectedValueOnce(
      new ApiError({
        code: 'FORBIDDEN',
        message: 'Missing or invalid CSRF token.',
        retryable: false,
        correlationId: 'test-correlation-id',
      }),
    );
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/username or student id/i), 'ST001');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/missing or invalid csrf token/i);
  });

  it('still shows the generic message for a genuine UNAUTHENTICATED login failure', async () => {
    login.mockRejectedValueOnce(
      new ApiError({
        code: 'UNAUTHENTICATED',
        message: 'Invalid credentials.',
        retryable: false,
        correlationId: 'test-correlation-id',
      }),
    );
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/username or student id/i), 'ST001');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /incorrect username\/id or password/i,
    );
  });

  it('shows the network-error message when the request never reached the server', async () => {
    login.mockRejectedValueOnce(new NetworkError());
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/username or student id/i), 'ST001');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });
});
