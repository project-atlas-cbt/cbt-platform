import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

/**
 * Regression test for a real infinite-request-loop bug found by live
 * browser testing: `unauthenticatedMiddleware` used to call
 * `onUnauthenticated()` on *every* 401 response, unconditionally.
 * `AuthProvider.reload()` (its one real consumer) invalidates the
 * globally-mounted `/auth/me` query, forcing an immediate refetch — on any
 * page where `/auth/me` structurally cannot succeed (no school on the
 * platform admin host; a genuinely expired school session), that refetch's
 * own 401 retriggered the same handler forever. The fix debounces the
 * handler to once per unbroken run of 401s, resetting on the next
 * successful response.
 *
 * `openapi-fetch`'s `createClient()` captures `globalThis.fetch` once, as a
 * default-parameter value, at call time — not re-read per request. Since
 * `apiClient` is constructed once at `client.ts`'s module scope, the mocked
 * `fetch` must be in place *before* that module first evaluates, so each
 * test resets the module registry and re-imports it fresh after stubbing.
 */
describe('apiClient unauthenticated-response debounce', () => {
  const handler = vi.fn();

  beforeEach(() => {
    handler.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetchSequence(statuses: number[]) {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        const status = statuses[Math.min(call, statuses.length - 1)] ?? 200;
        call += 1;
        return Promise.resolve(new Response(JSON.stringify({}), { status }));
      }),
    );
  }

  async function freshClient() {
    return import('./client');
  }

  it('fires the handler once for a run of consecutive 401s, not once per request', async () => {
    stubFetchSequence([401, 401, 401]);
    const { apiClient, setUnauthenticatedHandler } = await freshClient();
    setUnauthenticatedHandler(handler);

    await apiClient.GET('/health', {}).catch(() => {});
    await apiClient.GET('/health', {}).catch(() => {});
    await apiClient.GET('/health', {}).catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires again after an intervening success — a later, genuinely new session loss is not swallowed', async () => {
    stubFetchSequence([401, 200, 401]);
    const { apiClient, setUnauthenticatedHandler } = await freshClient();
    setUnauthenticatedHandler(handler);

    await apiClient.GET('/health', {}).catch(() => {});
    await apiClient.GET('/health', {}).catch(() => {});
    await apiClient.GET('/health', {}).catch(() => {});
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
