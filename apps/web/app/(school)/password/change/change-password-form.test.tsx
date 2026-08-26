import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangePasswordForm } from './change-password-form';
import { apiClient } from '@/lib/api';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const reload = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, useAuth: () => ({ reload }) };
});

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { POST: vi.fn() } };
});

const mockPost = vi.mocked(apiClient.POST);

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    mockPost.mockReset();
    reload.mockReset();
    replace.mockReset();
  });

  it('rejects mismatched passwords before submitting', async () => {
    render(<ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/^new password$/i), '0123456789');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'nine876543');
    await userEvent.click(screen.getByRole('button', { name: /set new password/i }));
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('reloads the session and hands off to "/" on success', async () => {
    mockPost.mockReturnValueOnce(
      Promise.resolve({
        data: { status: 'ok' },
        response: new Response(null, { status: 200 }),
      } as never),
    );
    render(<ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/^new password$/i), '0123456789');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), '0123456789');
    await userEvent.click(screen.getByRole('button', { name: /set new password/i }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('shows an error message on failure', async () => {
    // A non-2xx response resolves successfully with an `error` field
    // (openapi-fetch's real contract) — unwrap() is what turns that into a
    // thrown ApiError; a *rejected* promise here would mean the fetch
    // itself failed (NetworkError), which is a different, wrong scenario.
    mockPost.mockReturnValueOnce(
      Promise.resolve({
        error: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Password too weak.',
            retryable: false,
            correlationId: 'c1',
          },
        },
        response: new Response(null, { status: 400 }),
      } as never),
    );
    render(<ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/^new password$/i), '0123456789');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), '0123456789');
    await userEvent.click(screen.getByRole('button', { name: /set new password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/password too weak/i);
    expect(replace).not.toHaveBeenCalled();
  });
});
