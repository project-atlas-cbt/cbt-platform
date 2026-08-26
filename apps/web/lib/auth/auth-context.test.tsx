import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth-context';
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
  user: { id: 'u1', firstName: 'A', lastName: 'B', displayName: 'A B', status: 'ACTIVE' },
  membership: { id: 'm1', loginIdentifier: 'ST001', status: 'ACTIVE' },
  roles: ['STUDENT'],
  effectiveSchoolId: 's1',
};

function Probe() {
  const { status, me } = useAuth();
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
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('starts loading, then resolves to authenticated on a successful /auth/me', async () => {
    mockGet.mockReturnValueOnce(okResponse(ME_PAYLOAD));
    renderWithProviders();

    expect(screen.getByTestId('status').textContent).toBe('loading:');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated:A B'));
  });

  it('resolves to unauthenticated on a 401', async () => {
    mockGet.mockReturnValueOnce(errorResponse('UNAUTHENTICATED', 401));
    renderWithProviders();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated:'));
  });

  it('resolves to password-change-required on a 403 PASSWORD_CHANGE_REQUIRED', async () => {
    mockGet.mockReturnValueOnce(errorResponse('PASSWORD_CHANGE_REQUIRED', 403));
    renderWithProviders();

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('password-change-required:'),
    );
  });

  it('a page reload (fresh /auth/me call, no login()) still lands authenticated — DoD item 8', async () => {
    // No login() is ever called in this test — this is the whole point:
    // the cookie alone (simulated here by /auth/me simply succeeding on
    // first mount) is what DoD item 8 depends on, not any client code.
    mockGet.mockReturnValueOnce(okResponse(ME_PAYLOAD));
    renderWithProviders();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated:A B'));
    expect(mockPost).not.toHaveBeenCalled();
  });
});
