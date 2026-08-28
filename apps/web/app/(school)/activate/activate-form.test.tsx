import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActivateForm } from './activate-form';
import { apiClient } from '@/lib/api';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const login = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, useAuth: () => ({ login }) };
});

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { POST: vi.fn() } };
});

const mockPost = vi.mocked(apiClient.POST);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}
function fail(code: string, message: string, status = 409) {
  return Promise.resolve({
    error: { error: { code, message, retryable: false, correlationId: 'c1' } },
    response: new Response(null, { status }),
  } as never);
}

describe('ActivateForm', () => {
  beforeEach(() => {
    mockPost.mockReset();
    login.mockReset();
    replace.mockReset();
  });

  it('shows a specific message for an already-used key', async () => {
    mockPost.mockReturnValueOnce(fail('ACTIVATION_KEY_ALREADY_USED', 'used'));
    render(<ActivateForm />);
    await userEvent.type(screen.getByLabelText(/activation key/i), 'KEY-1');
    await userEvent.click(screen.getByRole('button', { name: /verify key/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already been used/i);
  });

  it('shows a specific message for an expired key', async () => {
    mockPost.mockReturnValueOnce(fail('ACTIVATION_KEY_EXPIRED', 'expired'));
    render(<ActivateForm />);
    await userEvent.type(screen.getByLabelText(/activation key/i), 'KEY-1');
    await userEvent.click(screen.getByRole('button', { name: /verify key/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
  });

  it('shows a specific message for an invalid/foreign key', async () => {
    mockPost.mockReturnValueOnce(fail('ACTIVATION_KEY_INVALID', 'invalid', 404));
    render(<ActivateForm />);
    await userEvent.type(screen.getByLabelText(/activation key/i), 'KEY-1');
    await userEvent.click(screen.getByRole('button', { name: /verify key/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid for this school/i);
  });

  it('INITIAL_ACTIVATION: verifies, sets a password, redeems, logs in, and routes to onboarding', async () => {
    mockPost.mockReturnValueOnce(
      ok({ schoolName: 'Greenfield High', purpose: 'INITIAL_ACTIVATION', requiresPassword: true }),
    );
    render(<ActivateForm />);
    await userEvent.type(screen.getByLabelText(/activation key/i), 'KEY-1');
    await userEvent.click(screen.getByRole('button', { name: /verify key/i }));
    expect(await screen.findByText(/greenfield high/i)).toBeInTheDocument();

    mockPost.mockReturnValueOnce(ok({ status: 'ok', loginIdentifier: 'school-admin-1' }));
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'a-real-password-1');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'a-real-password-1');
    await userEvent.click(screen.getByRole('button', { name: /activate school/i }));

    expect(login).toHaveBeenCalledWith('school-admin-1', 'a-real-password-1');
    expect(replace).toHaveBeenCalledWith('/onboarding');
  });

  it('rejects mismatched passwords before redeeming', async () => {
    mockPost.mockReturnValueOnce(
      ok({ schoolName: 'Greenfield High', purpose: 'INITIAL_ACTIVATION', requiresPassword: true }),
    );
    render(<ActivateForm />);
    await userEvent.type(screen.getByLabelText(/activation key/i), 'KEY-1');
    await userEvent.click(screen.getByRole('button', { name: /verify key/i }));
    await screen.findByText(/greenfield high/i);

    await userEvent.type(screen.getByLabelText(/^new password$/i), 'a-real-password-1');
    await userEvent.type(screen.getByLabelText(/confirm new password/i), 'different-password');
    await userEvent.click(screen.getByRole('button', { name: /activate school/i }));
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('RENEWAL: shows renewal messaging instead of a password form, never calls login()', async () => {
    mockPost.mockReturnValueOnce(
      ok({ schoolName: 'Greenfield High', purpose: 'RENEWAL', requiresPassword: false }),
    );
    render(<ActivateForm />);
    await userEvent.type(screen.getByLabelText(/activation key/i), 'KEY-2');
    await userEvent.click(screen.getByRole('button', { name: /verify key/i }));
    expect(await screen.findByText(/renewing the subscription/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument();

    mockPost.mockReturnValueOnce(ok({ status: 'ok', loginIdentifier: '' }));
    await userEvent.click(screen.getByRole('button', { name: /confirm renewal/i }));
    expect(await screen.findByText(/renewal complete/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /go to sign in/i }));
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
