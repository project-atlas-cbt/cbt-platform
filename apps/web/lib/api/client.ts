import createClient, { type Middleware } from 'openapi-fetch';
import type { ApiPaths } from '@atlas/contracts';
import { API_VERSION_PREFIX } from '@atlas/contracts';
import { NetworkError, toApiError } from './error';

/**
 * Base URL for every browser-originated call. `NEXT_PUBLIC_API_ORIGIN`
 * (new in F0) defaults to the local API's dev port — see next.config.ts's
 * comment on how it reaches the client bundle, and docs/operations/
 * domain-plan.md for the wider ADR-0005/ADR-0022 topology this sits in.
 *
 * The generated OpenAPI document's path keys (e.g. `/health`) don't
 * include the `/v1` prefix — that's applied at runtime by main.ts's
 * `app.setGlobalPrefix()`, outside the document Swagger generates — so
 * `API_VERSION_PREFIX` (@atlas/contracts) is appended here once, the same
 * way every other consumer of this contract is expected to.
 */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001';

/**
 * Typed directly against `@atlas/contracts`'s generated OpenAPI paths —
 * this is what F0's "typed API client generated from packages/contracts"
 * scope item means concretely. `credentials: 'include'` always: the
 * session is an `HttpOnly` cookie (ADR-0022), never a token this code
 * could read or store itself.
 */
export const apiClient = createClient<ApiPaths>({
  baseUrl: `${API_ORIGIN}${API_VERSION_PREFIX}`,
  credentials: 'include',
});

/**
 * `X-CSRF-Token` attach point (ADR-0022's double-submit pattern). F0 has
 * no real token source yet — `tenant/resolve` (F1) is what supplies one —
 * so this starts `null` and every mutating request simply omits the
 * header until F1 wires `setCsrfToken()` in on login-flow bootstrap.
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
