import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { SystemConfigurationScreen } from './system-configuration-screen';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() },
  };
});
const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);
const mockPatch = vi.mocked(apiClient.PATCH);

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

const base = {
  updatedAt: null,
  updatedBy: null,
};

function payload(lockout = 5, overridden = false) {
  return {
    settings: [
      {
        ...base,
        key: 'opsAlertEmails',
        group: 'operations',
        label: 'Operations alert recipients',
        description: 'Who is emailed.',
        kind: 'emailList',
        min: 0,
        max: 10,
        value: ['ops@x.test'],
        defaultValue: ['ops@x.test'],
        overridden: false,
        envKey: 'OPS_ALERT_EMAILS',
      },
      {
        ...base,
        key: 'platformSessionIdleTimeoutSeconds',
        group: 'sign-in',
        label: 'Software Admin idle sign-out',
        description: 'Signed out after this long idle.',
        kind: 'duration',
        unit: 'minutes',
        min: 300,
        max: 7200,
        value: 1800,
        defaultValue: 1800,
        overridden: false,
        envKey: 'PLATFORM_SESSION_IDLE_TIMEOUT_SECONDS',
      },
      {
        key: 'authLockoutMaxAttempts',
        group: 'sign-in',
        label: 'Failed sign-ins before lockout',
        description: 'Wrong passwords allowed.',
        kind: 'count',
        min: 3,
        max: 20,
        value: lockout,
        defaultValue: 5,
        overridden,
        envKey: 'AUTH_LOCKOUT_MAX_ATTEMPTS',
        updatedAt: overridden ? '2026-10-05T10:00:00.000Z' : null,
        updatedBy: overridden ? 'Sam Admin' : null,
      },
    ],
    environment: { releaseVersion: 'v1.2.3', emailTransport: 'smtp' },
  };
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SystemConfigurationScreen />
    </QueryClientProvider>,
  );
}

describe('SystemConfigurationScreen (ADR-0036)', { timeout: 20_000 }, () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPatch.mockReset();
    mockGet.mockImplementation((() => ok(payload())) as never);
  });

  it('shows each setting with its default and unit', async () => {
    renderScreen();
    expect(await screen.findByLabelText('Software Admin idle sign-out')).toHaveValue(30);
    expect(screen.getByText('Between 5 and 120 minutes.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('OPS_ALERT_EMAILS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(screen.getByText(/release v1\.2\.3/i)).toBeInTheDocument();
  });

  it('checks limits before asking for a reason', async () => {
    renderScreen();
    const user = userEvent.setup();
    const field = await screen.findByLabelText('Failed sign-ins before lockout');
    await user.clear(field);
    await user.type(field, '50');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('Between 3 and 20.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('saves only changed settings, in seconds, with a reason', async () => {
    mockPatch.mockImplementation((() => ok(payload(7, true))) as never);
    renderScreen();
    const user = userEvent.setup();
    const idle = await screen.findByLabelText('Software Admin idle sign-out');
    await user.clear(idle);
    await user.type(idle, '45');
    const lockout = screen.getByLabelText('Failed sign-ins before lockout');
    await user.clear(lockout);
    await user.type(lockout, '7');
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/30 minutes → 45 minutes/)).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox'), 'Pilot tuning');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/platform/settings', {
        body: {
          changes: [
            { key: 'platformSessionIdleTimeoutSeconds', value: 2700 },
            { key: 'authLockoutMaxAttempts', value: 7 },
          ],
          reason: 'Pilot tuning',
        },
      }),
    );
    expect(
      await screen.findByText(/saved\. the changes apply within 30 seconds/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/changed by sam admin/i)).toBeInTheDocument();
  });

  it('resets one setting to its default', async () => {
    mockGet.mockImplementation((() => ok(payload(7, true))) as never);
    mockPatch.mockImplementation((() => ok(payload())) as never);
    renderScreen();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: /reset failed sign-ins before lockout to default/i,
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'Back to normal');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/platform/settings', {
        body: {
          changes: [{ key: 'authLockoutMaxAttempts', value: null }],
          reason: 'Back to normal',
        },
      }),
    );
  });

  it('shows server field errors beside the field', async () => {
    mockPatch.mockImplementation((() =>
      Promise.resolve({
        error: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Some settings are outside their allowed limits.',
            retryable: false,
            correlationId: 'c',
            details: { fields: { opsAlertEmails: '"nope" is not an email address.' } },
          },
        },
        response: new Response(null, { status: 400 }),
      })) as never);
    renderScreen();
    const user = userEvent.setup();
    const field = await screen.findByLabelText('Operations alert recipients');
    await user.type(field, '\nnope');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'Adding someone');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText('"nope" is not an email address.')).toBeInTheDocument();
  });

  it('sends a test email', async () => {
    mockPost.mockImplementation((() => ok({ sentTo: 'sam@x.test' })) as never);
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /send test email/i }));
    expect(await screen.findByText(/sent to sam@x\.test/i)).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/platform/settings/test-email', {});
  });
});
