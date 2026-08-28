import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminLayout from './layout';
import { apiClient, setCsrfToken } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    apiClient: { GET: vi.fn(), POST: vi.fn() },
    setCsrfToken: vi.fn(),
  };
});

const mockGet = vi.mocked(apiClient.GET);
const mockSetCsrfToken = vi.mocked(setCsrfToken);

function okResponse<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

/**
 * Regression test for the bug found by live browser testing: entering
 * `/admin/(shell)/*` directly — not through `/admin/login` first — left
 * `apiClient`'s CSRF token unset for the whole session, since
 * `useTenantResolution()`'s bootstrap used to run only on the login page.
 * This renders `AdminLayout` in isolation (no `/admin/login` in the tree
 * at all, the exact "direct entry" shape) and asserts the CSRF bootstrap
 * still runs.
 */
describe('AdminLayout', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSetCsrfToken.mockReset();
  });

  it('bootstraps the CSRF token via tenant/resolve even with no /admin/login in the tree', async () => {
    mockGet.mockImplementation((path: unknown) => {
      if (path === '/tenant/resolve') {
        return okResponse({ csrfToken: 'shell-boot-token', school: null });
      }
      if (path === '/platform/auth/me') {
        return Promise.reject(new Error('unauthenticated'));
      }
      throw new Error(`unexpected GET ${String(path)}`);
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AdminLayout>
          <div>shell content</div>
        </AdminLayout>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(mockSetCsrfToken).toHaveBeenCalledWith('shell-boot-token'));
  });
});
