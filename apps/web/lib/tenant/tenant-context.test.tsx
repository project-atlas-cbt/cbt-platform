import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantProvider, useTenant } from './tenant-context';
import { apiClient } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiClient: { GET: vi.fn() },
    setCsrfToken: vi.fn(),
  };
});

const mockGet = vi.mocked(apiClient.GET);

function okResponse<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function Probe() {
  const { status, school } = useTenant();
  return (
    <div data-testid="status">
      {status}:{school?.primaryColor ?? 'none'}
    </div>
  );
}

let client: QueryClient;

function renderWithProvider() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TenantProvider>
        <Probe />
      </TenantProvider>
    </QueryClientProvider>,
  );
}

describe('TenantProvider / useTenantResolution', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('resolves the school and its branding', async () => {
    mockGet.mockResolvedValueOnce(
      okResponse({
        csrfToken: 't1',
        school: {
          name: 'Greenfield',
          subdomain: 'greenfield',
          timezone: 'Africa/Lagos',
          logoUrl: null,
          primaryColor: '#111111',
        },
      }),
    );
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('resolved:#111111'));
  });

  it('falls through to an error state without throwing', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error:none'));
  });

  it("refetches and repaints when ['tenant','resolve'] is invalidated — the mechanism that makes a branding save propagate app-wide", async () => {
    mockGet.mockResolvedValueOnce(
      okResponse({
        csrfToken: 't1',
        school: {
          name: 'Greenfield',
          subdomain: 'greenfield',
          timezone: 'Africa/Lagos',
          logoUrl: null,
          primaryColor: '#111111',
        },
      }),
    );
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('resolved:#111111'));

    // Simulates useUpdateBranding's onSuccess invalidating this same key.
    mockGet.mockResolvedValueOnce(
      okResponse({
        csrfToken: 't2',
        school: {
          name: 'Greenfield',
          subdomain: 'greenfield',
          timezone: 'Africa/Lagos',
          logoUrl: null,
          primaryColor: '#2563EB',
        },
      }),
    );
    await client.invalidateQueries({ queryKey: ['tenant', 'resolve'] });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('resolved:#2563EB'));
  });
});
