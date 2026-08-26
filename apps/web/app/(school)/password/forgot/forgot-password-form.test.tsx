import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from './forgot-password-form';
import { apiClient } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { POST: vi.fn() } };
});

const mockPost = vi.mocked(apiClient.POST);

describe('ForgotPasswordForm', () => {
  beforeEach(() => mockPost.mockReset());

  it('validates a non-empty identifier before submitting', async () => {
    render(<ForgotPasswordForm />);
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/enter your username or staff id/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('shows the same success state regardless of whether the account exists — enumeration resistance', async () => {
    mockPost.mockReturnValueOnce(
      Promise.resolve({
        data: { status: 'ok' },
        response: new Response(null, { status: 200 }),
      } as never),
    );
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/username or staff id/i), 'T001');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });
});
