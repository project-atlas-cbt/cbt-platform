import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlatformAuthProvider, usePlatformAuth } from './platform-auth-context';
import { apiClient } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiClient: { GET: vi.fn(), POST: vi.fn() },
  };
});

const mockGet = vi.mocked(apiClient.GET);
const mockPost = vi.mocked(apiClient.POST);

function okResponse<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function errorResponse(code: string, httpStatus: number) {
  return Promise.resolve({
    error: { error: { code, message: 'x', retryable: false, correlationId: 'c1' } },
    response: new Response(null, { status: httpStatus }),
  } as never);
}

const ME_PAYLOAD = {
  user: {
    id: 'p1',
    firstName: 'Sam',
    lastName: 'Admin',
    displayName: 'Sam Admin',
    status: 'ACTIVE',
  },
  roles: ['SOFTWARE_ADMIN'],
};

function Probe() {
  const { status, me } = usePlatformAuth();
  return (
    <div data-testid="status">
      {status}:{me?.user.displayName ?? ''}
    </div>
  );
}

function renderWithProviders() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlatformAuthProvider>
        <Probe />
      </PlatformAuthProvider>
    </QueryClientProvider>,
  );
}

describe('PlatformAuthProvider', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('starts loading, then resolves to authenticated on a successful /platform/auth/me', async () => {
    mockGet.mockReturnValueOnce(okResponse(ME_PAYLOAD));
    renderWithProviders();

    expect(screen.getByTestId('status').textContent).toBe('loading:');
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated:Sam Admin'),
    );
  });

  it('resolves to unauthenticated on a 401 — no password-change-required branch exists for a platform account', async () => {
    mockGet.mockReturnValueOnce(errorResponse('UNAUTHENTICATED', 401));
    renderWithProviders();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated:'));
  });

  it('a page reload (fresh /platform/auth/me call, no login()) still lands authenticated', async () => {
    mockGet.mockReturnValueOnce(okResponse(ME_PAYLOAD));
    renderWithProviders();

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated:Sam Admin'),
    );
    expect(mockPost).not.toHaveBeenCalled();
  });
});
