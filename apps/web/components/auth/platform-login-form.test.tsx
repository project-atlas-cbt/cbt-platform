import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, NetworkError } from '@/lib/api';
import { PlatformLoginForm } from './platform-login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const login = vi.fn();
const verifyOtp = vi.fn();
const verifyRecovery = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, usePlatformAuth: () => ({ login, verifyOtp, verifyRecovery }) };
});

// Defaults to 'resolved' — the CSRF bootstrap (normally run by
// app/admin/layout.tsx) already having completed — for every test below
// that isn't specifically exercising the loading-state guard. See
// platform-login-form.tsx's own comment for the race this mock lets us
// simulate both sides of.
let tenantStatus: 'loading' | 'resolved' | 'error' = 'resolved';
vi.mock('@/lib/tenant', () => ({
  useTenantResolution: () => ({ status: tenantStatus, school: null }),
}));

describe('PlatformLoginForm', () => {
  beforeEach(() => {
    login.mockReset();
    verifyOtp.mockReset();
    verifyRecovery.mockReset();
    replace.mockReset();
    tenantStatus = 'resolved';
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
    login.mockResolvedValueOnce({ status: 'ok' });
    render(<PlatformLoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
  });

  it('F20 (B20 MFA) — an enrolled admin is asked for a code after the password, then signed in', async () => {
    login.mockResolvedValueOnce({ status: 'mfa_required', challengeToken: 'challenge-1' });
    verifyOtp.mockResolvedValueOnce(undefined);
    render(<PlatformLoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const code = await screen.findByLabelText(/authentication code/i);
    expect(replace).not.toHaveBeenCalled();
    await userEvent.type(code, '123 456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith('challenge-1', '123456'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
  });

  it('F20 — a wrong code shows one generic message; a recovery code can be used instead', async () => {
    login.mockResolvedValueOnce({ status: 'mfa_required', challengeToken: 'challenge-2' });
    verifyOtp.mockRejectedValueOnce(new Error('nope'));
    verifyRecovery.mockResolvedValueOnce(undefined);
    render(<PlatformLoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await userEvent.type(await screen.findByLabelText(/authentication code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /use a recovery code/i }));
    await userEvent.type(screen.getByLabelText(/recovery code/i), 'abcd-efgh-ijkl-mnop');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() =>
      expect(verifyRecovery).toHaveBeenCalledWith('challenge-2', 'abcd-efgh-ijkl-mnop'),
    );
  });

  it('has no forgot-password link — no email-backed reset flow exists for a platform account', () => {
    render(<PlatformLoginForm />);
    expect(screen.queryByRole('link', { name: /forgot your password/i })).not.toBeInTheDocument();
  });

  it('disables submission until the CSRF bootstrap resolves — same race LoginForm closes', async () => {
    tenantStatus = 'loading';
    render(<PlatformLoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(login).not.toHaveBeenCalled();
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
    render(<PlatformLoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/missing or invalid csrf token/i);
  });

  it('shows the network-error message when the request never reached the server', async () => {
    login.mockRejectedValueOnce(new NetworkError());
    render(<PlatformLoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'right');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });
});
