import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { SecuritySettingsScreen } from './security-settings-screen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn(), POST: vi.fn() } };
});
const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

let status = { enrolled: false, required: false, recoveryCodesRemaining: 0 };
const ADMINS = {
  admins: [
    {
      userId: 'u-self',
      displayName: 'Sam Admin',
      email: 'sam@x.test',
      mfaEnrolled: false,
      isSelf: true,
    },
    {
      userId: 'u-peer',
      displayName: 'Bola Admin',
      email: 'bola@x.test',
      mfaEnrolled: true,
      isSelf: false,
    },
  ],
};
const RECOVERY = Array.from({ length: 10 }, (_, i) => `code-${i}-aaaa-bbbb`);

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SecuritySettingsScreen />
    </QueryClientProvider>,
  );
}

describe('SecuritySettingsScreen (F20, carried from B20)', { timeout: 20_000 }, () => {
  beforeEach(() => {
    status = { enrolled: false, required: false, recoveryCodesRemaining: 0 };
    mockGet.mockReset();
    mockPost.mockReset();
    mockGet.mockImplementation(((path: string) =>
      path === '/platform/auth/mfa' ? ok(status) : ok(ADMINS)) as never);
    mockPost.mockImplementation(((path: string) => {
      if (path === '/platform/auth/mfa/enrol')
        return ok({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/Atlas:sam@x.test?secret=JBSWY3DPEHPK3PXP&issuer=Atlas',
        });
      if (path === '/platform/auth/mfa/enrol/confirm') {
        status = { enrolled: true, required: false, recoveryCodesRemaining: 10 };
        return ok({ recoveryCodes: RECOVERY });
      }
      return ok({ status: 'ok' });
    }) as never);
  });

  it('enrols: QR + manual key, confirm with a code, recovery codes shown once, then On', async () => {
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /set up two-step sign-in/i }));
    await user.click(screen.getByRole('button', { name: /set up authenticator/i }));

    expect(
      await screen.findByRole('img', { name: /authenticator setup qr code/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/enter the 6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/platform/auth/mfa/enrol/confirm', {
        body: { otp: '123456' },
      }),
    );

    const list = await screen.findByRole('list', { name: /recovery codes/i });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    const finish = screen.getByRole('button', { name: /finish/i });
    expect(finish).toBeDisabled();
    await user.click(screen.getByLabelText(/i have saved these codes/i));
    await user.click(finish);
    expect(await screen.findByText(/10 unused recovery codes left/i)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /recovery codes/i })).not.toBeInTheDocument();
  });

  it('peer reset needs a reason and is never offered for yourself', async () => {
    renderScreen();
    const user = userEvent.setup();
    await screen.findByText('Bola Admin');
    expect(
      screen.queryByRole('button', { name: /reset two-step sign-in for sam admin/i }),
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: /reset two-step sign-in for bola admin/i }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'Lost phone, verified by call');
    await user.click(within(dialog).getByRole('button', { name: /^reset$/i }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/platform/auth/mfa/reset', {
        body: { userId: 'u-peer', reason: 'Lost phone, verified by call' },
      }),
    );
  });
});
