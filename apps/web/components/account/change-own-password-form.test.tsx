import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChangeOwnPasswordForm } from './change-own-password-form';
import { apiClient } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { POST: vi.fn() } };
});

const mockPost = vi.mocked(apiClient.POST);

describe('ChangeOwnPasswordForm', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('requires the current password (distinct from the forced-change form)', async () => {
    render(<ChangeOwnPasswordForm />);
    await userEvent.type(screen.getByLabelText(/^new password$/i), '0123456789');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), '0123456789');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByText(/enter your current password/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects mismatched new passwords before submitting', async () => {
    render(<ChangeOwnPasswordForm />);
    await userEvent.type(screen.getByLabelText(/current password/i), 'old-password-1');
    await userEvent.type(screen.getByLabelText(/^new password$/i), '0123456789');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'nine876543');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits currentPassword + newPassword and shows an inline success message, without navigating', async () => {
    mockPost.mockReturnValueOnce(
      Promise.resolve({
        data: { status: 'ok' },
        response: new Response(null, { status: 200 }),
      } as never),
    );
    render(<ChangeOwnPasswordForm />);
    await userEvent.type(screen.getByLabelText(/current password/i), 'old-password-1');
    await userEvent.type(screen.getByLabelText(/^new password$/i), '0123456789');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), '0123456789');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByText(/your password has been updated/i)).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/auth/password/change', {
      body: { currentPassword: 'old-password-1', newPassword: '0123456789' },
    });
  });

  it('shows the server error on a wrong current password', async () => {
    mockPost.mockReturnValueOnce(
      Promise.resolve({
        error: {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Current password is incorrect.',
            retryable: false,
            correlationId: 'c1',
          },
        },
        response: new Response(null, { status: 401 }),
      } as never),
    );
    render(<ChangeOwnPasswordForm />);
    await userEvent.type(screen.getByLabelText(/current password/i), 'wrong-password');
    await userEvent.type(screen.getByLabelText(/^new password$/i), '0123456789');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), '0123456789');
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/current password is incorrect/i);
    expect(screen.queryByText(/your password has been updated/i)).not.toBeInTheDocument();
  });
});
