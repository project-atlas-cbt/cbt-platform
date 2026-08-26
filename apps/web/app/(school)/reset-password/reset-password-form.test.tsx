import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPasswordForm } from './reset-password-form';
import { apiClient } from '@/lib/api';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { POST: vi.fn() } };
});

const mockPost = vi.mocked(apiClient.POST);

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    mockPost.mockReset();
    replace.mockReset();
  });

  it('shows a missing-link empty state when there is no token', () => {
    render(<ResetPasswordForm token={undefined} />);
    expect(screen.getByText(/missing reset link/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute(
      'href',
      '/password/forgot',
    );
  });

  it('rejects mismatched passwords before submitting', async () => {
    render(<ResetPasswordForm token="tok123" />);
    await userEvent.type(screen.getByLabelText(/^new password$/i), '0123456789');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'nine876543');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('shows a specific, actionable error for an invalid/expired token — not a generic one', async () => {
    // A non-2xx response resolves successfully with an `error` field
    // (openapi-fetch's real contract) — unwrap() is what turns that into a
    // thrown ApiError; a *rejected* promise here would mean the fetch
    // itself failed (NetworkError), which is a different, wrong scenario.
    mockPost.mockReturnValueOnce(
      Promise.resolve({
        error: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid or expired reset token.',
            retryable: false,
            correlationId: 'c1',
          },
        },
        response: new Response(null, { status: 400 }),
      } as never),
    );
    render(<ResetPasswordForm token="expired-token" />);
    await userEvent.type(screen.getByLabelText(/^new password$/i), '0123456789');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), '0123456789');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or expired reset token/i);
  });

  it('shows a success state and sends the user to sign in', async () => {
    mockPost.mockReturnValueOnce(
      Promise.resolve({
        data: { status: 'ok' },
        response: new Response(null, { status: 200 }),
      } as never),
    );
    render(<ResetPasswordForm token="tok123" />);
    await userEvent.type(screen.getByLabelText(/^new password$/i), '0123456789');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), '0123456789');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    const goToSignIn = await screen.findByRole('button', { name: /go to sign in/i });
    await userEvent.click(goToSignIn);
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
