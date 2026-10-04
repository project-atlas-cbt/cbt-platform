import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { MfaEnrolmentGate } from './mfa-enrolment-gate';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn(), POST: vi.fn() } };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/lib/auth', async () => ({
  ...(await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')),
  usePlatformAuth: () => ({ logout: vi.fn() }),
}));
const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

const RECOVERY = Array.from({ length: 10 }, (_, i) => `code-${i}-aaaa-bbbb`);

describe('MfaEnrolmentGate (F20)', { timeout: 20_000 }, () => {
  let status = { enrolled: false, required: true, recoveryCodesRemaining: 0 };

  beforeEach(() => {
    status = { enrolled: false, required: true, recoveryCodesRemaining: 0 };
    mockGet.mockReset();
    mockPost.mockReset();
    mockGet.mockImplementation((() => ok(status)) as never);
    mockPost.mockImplementation(((path: string) => {
      if (path === '/platform/auth/mfa/enrol')
        return ok({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/A:a?secret=J' });
      status = { enrolled: true, required: true, recoveryCodesRemaining: 10 };
      return ok({ recoveryCodes: RECOVERY });
    }) as never);
  });

  it('keeps the recovery codes on screen after confirming, until Finish', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MfaEnrolmentGate>
          <p>platform shell</p>
        </MfaEnrolmentGate>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Set up authenticator' }));
    await user.type(await screen.findByLabelText('Enter the 6-digit code it shows'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    // The status refetch now says "enrolled" — the codes must survive it.
    expect(await screen.findByRole('list', { name: 'Recovery codes' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByRole('list', { name: 'Recovery codes' })).toBeInTheDocument();
    expect(screen.queryByText('platform shell')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('I have saved these codes'));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('platform shell')).toBeInTheDocument();
  });

  it('renders the shell directly for an enrolled admin', async () => {
    status = { enrolled: true, required: true, recoveryCodesRemaining: 10 };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MfaEnrolmentGate>
          <p>platform shell</p>
        </MfaEnrolmentGate>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('platform shell')).toBeInTheDocument();
  });
});
