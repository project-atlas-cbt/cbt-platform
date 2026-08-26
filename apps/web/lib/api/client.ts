import createClient, { type Middleware } from 'openapi-fetch';
import type { ApiPaths } from '@atlas/contracts';
import { API_VERSION_PREFIX } from '@atlas/contracts';
import { NetworkError, toApiError } from './error';
import { resolveApiOrigin } from './resolve-origin';

/**
 * Fallback base URL, used unchanged only when the page has no tenant
 * subdomain (plain `localhost`, native dev's default) — see
 * `dynamicOriginMiddleware` below for the real, per-request origin used
 * everywhere else. `NEXT_PUBLIC_API_ORIGIN` (F0) — see next.config.ts's
 * comment on how it reaches the client bundle, and docs/operations/
 * domain-plan.md for the wider ADR-0005/ADR-0022 topology this sits in.
 */
const FALLBACK_API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001';
/** The API's own port (F1) — see resolve-origin.ts's doc comment. */
const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? '3001';

/**
 * The generated OpenAPI document's path keys (e.g. `/health`) don't
 * include the `/v1` prefix — that's applied at runtime by main.ts's
 * `app.setGlobalPrefix()`, outside the document Swagger generates — so
 * `API_VERSION_PREFIX` (@atlas/contracts) is appended here once, the same
 * way every other consumer of this contract is expected to.
 */
const BASE_PATH = API_VERSION_PREFIX;

/**
 * Typed directly against `@atlas/contracts`'s generated OpenAPI paths —
 * this is what F0's "typed API client generated from packages/contracts"
 * scope item means concretely. `credentials: 'include'` always: the
 * session is an `HttpOnly` cookie (ADR-0022), never a token this code
 * could read or store itself. Constructed once against the fallback
 * origin; `dynamicOriginMiddleware` rewrites the actual host+port used on
 * every request.
 */
export const apiClient = createClient<ApiPaths>({
  baseUrl: `${FALLBACK_API_ORIGIN}${BASE_PATH}`,
  credentials: 'include',
});

/**
 * F1: rewrites every request's origin to `resolveApiOrigin`'s result,
 * computed fresh from `window.location` on each call — a single client
 * module instance must serve whichever school subdomain the page happens
 * to be viewed at, and that can only be known at request time, not at
 * module-load time. Path and query are preserved untouched; only the
 * scheme/host/port change. `new Request(url, request)` is the standard way
 * to clone a `Request` with a different URL — `Request` instances satisfy
 * `RequestInit` structurally, so every other property (method, headers,
 * body, credentials) carries over unchanged.
 *
 * Guarded by `typeof window` because this client is only ever called from
 * client components (TanStack Query is explicitly browser-side-only per
 * F0's own doctrine) — an SSR call would have no `window.location` to read
 * a tenant subdomain from anyway. The one genuinely server-side call F1
 * needs (pre-login tenant resolution) reads the inbound request's `Host`
 * header directly instead — see lib/api/resolve-tenant.server.ts.
 */
const dynamicOriginMiddleware: Middleware = {
  onRequest({ request }) {
    if (typeof window === 'undefined') return request;
    const origin = resolveApiOrigin(
      window.location.hostname,
      window.location.protocol,
      FALLBACK_API_ORIGIN,
      API_PORT,
    );
    const current = new URL(request.url);
    const rewritten = new URL(`${current.pathname}${current.search}`, origin);
    return new Request(rewritten, request);
  },
};

apiClient.use(dynamicOriginMiddleware);

/**
 * `X-CSRF-Token` attach point (ADR-0022's double-submit pattern). Starts
 * `null` — a mutating request made before any tenant/session bootstrap has
 * run simply omits the header (the API will reject it, correctly). F1's
 * `<TenantProvider>` (lib/tenant/tenant-context.tsx) calls `setCsrfToken()`
 * with the value `GET /tenant/resolve` returns on mount, the first real
 * consumer of this. Deliberately client-side, not SSR: forwarding the
 * `_csrf` `Set-Cookie` header from a server-side fetch to the browser would
 * need a Next.js route handler in between, which ADR-0022 already rejected
 * ("Proxy API calls through Next.js route handlers... undermines 09 §29's
 * reasoning for keeping the API off serverless"). A plain cross-origin
 * `fetch(..., { credentials: 'include' })` from the browser sets the cookie
 * directly and needs no proxy.
 */
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

const csrfMiddleware: Middleware = {
  onRequest({ request }) {
    const method = request.method.toUpperCase();
    if (csrfToken && method !== 'GET' && method !== 'HEAD') {
      request.headers.set('X-CSRF-Token', csrfToken);
    }
    return request;
  },
};

apiClient.use(csrfMiddleware);

/**
 * F1: a single shared reaction to "the server just told us this session is
 * gone" (401 `UNAUTHENTICATED`), rather than every call site having to
 * catch and branch on it individually. `lib/auth/auth-context.tsx`
 * registers itself here on mount — the one real consumer today — so any
 * authenticated call anywhere in the app (not just the initial `/auth/me`
 * bootstrap) collapses to the same "not logged in" state. Deliberately
 * fires on `401` alone: `PASSWORD_CHANGE_REQUIRED` is a distinct `403`
 * (packages/domain's BASE_ERROR_CODES) and is handled separately by
 * `AuthProvider`'s own `/auth/me` branch, not here.
 */
let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

const unauthenticatedMiddleware: Middleware = {
  onResponse({ response }) {
    if (response.status === 401) {
      onUnauthenticated?.();
    }
    return response;
  },
};

apiClient.use(unauthenticatedMiddleware);

/**
 * Turns an openapi-fetch result (or a thrown network failure) into either
 * the typed success payload or a thrown `ApiError`/`NetworkError` — the
 * one place that distinction gets made, so every call site can just
 * `await unwrap(apiClient.GET(...))` and branch on a single typed catch.
 */
export async function unwrap<T>(
  resultPromise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await resultPromise;
  } catch {
    throw new NetworkError();
  }

  if (result.error !== undefined) {
    throw toApiError(result.error, result.response.status, 'The request failed.');
  }
  if (result.data === undefined) {
    // openapi-fetch guarantees one of data/error is set for a resolved
    // response; this branch only exists to keep the return type non-optional.
    throw new NetworkError('The server returned an unexpected empty response.');
  }
  return result.data;
}
