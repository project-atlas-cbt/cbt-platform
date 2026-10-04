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

/**
 * F20 (browser matrix): Firefox does not implement `Request.body`, and the
 * origin-rewriting middleware used to copy a body only when that getter was
 * truthy — so in Firefox every POST left with an empty body (sign-in got
 * `400 VALIDATION_ERROR`). Simulated by hiding the getter, as Firefox does.
 */
describe('apiClient keeps request bodies where Request.body is not implemented (Firefox)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the JSON body of a POST', async () => {
    vi.resetModules();
    const NativeRequest = globalThis.Request;
    class FirefoxLikeRequest extends NativeRequest {
      override get body(): null {
        return undefined as unknown as null;
      }
    }
    vi.stubGlobal('Request', FirefoxLikeRequest);
    const sent: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        sent.push(await input.text());
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );
    const { apiClient } = await import('./client');
    await apiClient.POST('/auth/login', { body: { identifier: 'ada', password: 'pw' } });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!)).toEqual({ identifier: 'ada', password: 'pw' });
  });
});
