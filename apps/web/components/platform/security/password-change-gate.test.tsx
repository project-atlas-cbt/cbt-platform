import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { PasswordChangeGate } from './password-change-gate';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn(), POST: vi.fn() } };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
let mustChangePassword = true;
vi.mock('@/lib/auth', async () => ({
  ...(await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')),
  usePlatformAuth: () => ({
    me: { user: { displayName: 'Ada Obi' }, roles: ['SOFTWARE_ADMIN'], mustChangePassword },
    logout: vi.fn(),
  }),
}));
const mockPost = vi.mocked(apiClient.POST);

function respond(status: number, body: unknown) {
  return Promise.resolve(
    status === 200
      ? ({ data: body, response: new Response(null, { status }) } as never)
      : ({ error: body, response: new Response(null, { status }) } as never),
  );
}

function renderGate() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PasswordChangeGate>
        <p>platform shell</p>
      </PasswordChangeGate>
    </QueryClientProvider>,
  );
}

describe('PasswordChangeGate', { timeout: 20_000 }, () => {
  beforeEach(() => {
    mustChangePassword = true;
    mockPost.mockReset();
  });

  it('renders the console once the password is the admin’s own', () => {
    mustChangePassword = false;
    renderGate();
    expect(screen.getByText('platform shell')).toBeInTheDocument();
  });

  it('asks for the temporary password and a new one, and sends both', async () => {
    mockPost.mockImplementation((() => respond(200, { status: 'ok' })) as never);
    const user = userEvent.setup();
    renderGate();

    expect(screen.queryByText('platform shell')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Temporary password (from the email)'), 'TEMP-pass-1');
    await user.type(screen.getByLabelText('New password'), 'my own passphrase');
    await user.type(screen.getByLabelText('Confirm new password'), 'my own passphrase');
    await user.click(screen.getByRole('button', { name: 'Save my password' }));

    expect(mockPost).toHaveBeenCalledWith('/platform/auth/password/change', {
      body: { currentPassword: 'TEMP-pass-1', newPassword: 'my own passphrase' },
    });
  });

  it('says so when the temporary password is wrong', async () => {
    mockPost.mockImplementation((() =>
      respond(401, {
        error: { code: 'UNAUTHENTICATED', message: 'Current password is incorrect.' },
      })) as never);
    const user = userEvent.setup();
    renderGate();

    await user.type(screen.getByLabelText('Temporary password (from the email)'), 'wrong');
    await user.type(screen.getByLabelText('New password'), 'my own passphrase');
    await user.type(screen.getByLabelText('Confirm new password'), 'my own passphrase');
    await user.click(screen.getByRole('button', { name: 'Save my password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That temporary password is not right.',
    );
  });

  it('checks the two new passwords match before sending', async () => {
    const user = userEvent.setup();
    renderGate();
    await user.type(screen.getByLabelText('Temporary password (from the email)'), 'TEMP-pass-1');
    await user.type(screen.getByLabelText('New password'), 'my own passphrase');
    await user.type(screen.getByLabelText('Confirm new password'), 'my own passphrase!');
    await user.click(screen.getByRole('button', { name: 'Save my password' }));
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
