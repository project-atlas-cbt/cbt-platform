'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError, NetworkError, setUnauthenticatedHandler, unwrap } from '@/lib/api';
import type { AuthMe, AuthStatus } from './types';

/**
 * `GET /auth/me` is fetched through TanStack Query (F0's already-established
 * admin/server-state layer — see lib/query/query-provider.tsx) rather than a
 * hand-rolled `useEffect`/`useState` pair: React's own
 * `react-hooks/set-state-in-effect` rule flags exactly that pattern
 * ("calling setState synchronously within an effect... can trigger
 * cascading renders"), and `useQuery` already handles the fetch-on-mount
 * lifecycle correctly. `login`/`logout`/`reload` all resolve to the same
 * `AuthStatus` derivation by invalidating this one query — see below.
 */
const ME_QUERY_KEY = ['auth', 'me'] as const;

interface AuthContextValue {
  status: AuthStatus;
  me: AuthMe | null;
  /** Human-readable reason the session bootstrap failed, if any. */
  error: string | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-runs the `/auth/me` bootstrap — used after a forced password change succeeds. */
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Rotates/extends the session cookie (POST /auth/refresh) while the tab is
// visible and the user is authenticated. An engineering default, not a
// value derived from any spec: comfortably inside SESSION_TTL_SECONDS's
// 7-day default (.env.example), and distinct from DoD item 8 ("a page
// refresh preserves the session"), which the HttpOnly cookie already
// satisfies with no client code running at all — this interval is what
// exercises `refresh` itself, per the roadmap's own testing table.
const SESSION_REFRESH_INTERVAL_MS = 20 * 60 * 1000;

/**
 * Session bootstrap and lifecycle (F1). `GET /auth/me` is the *only*
 * source of truth for who's logged in — roles are never derived from a
 * decoded token (09 §25), because there is no token to decode: the session
 * is an `HttpOnly` cookie this code can never read directly, only ask the
 * server about. A page reload re-runs this exact query from the cookie
 * alone — this is what makes DoD item 8 ("a page refresh preserves the
 * session") true with no silent-refresh machinery.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => unwrap(apiClient.GET('/auth/me', {})),
    // A rejection here (401 UNAUTHENTICATED, 403 PASSWORD_CHANGE_REQUIRED)
    // is a real, meaningful outcome, not a transient failure to paper over
    // — only a genuine NetworkError is worth a couple of quiet retries.
    retry: (failureCount, err) => err instanceof NetworkError && failureCount < 2,
    staleTime: Infinity,
  });

  const status: AuthStatus = meQuery.isPending
    ? 'loading'
    : meQuery.isSuccess
      ? 'authenticated'
      : meQuery.error instanceof ApiError && meQuery.error.code === 'PASSWORD_CHANGE_REQUIRED'
        ? 'password-change-required'
        : 'unauthenticated';

  const error =
    status === 'unauthenticated' &&
    (meQuery.error instanceof ApiError || meQuery.error instanceof NetworkError)
      ? meQuery.error.message
      : null;

  const me = meQuery.data ?? null;

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }, [queryClient]);

  // Shared reaction to any other authenticated call in the app coming back
  // 401 (lib/api/client.ts's unauthenticatedMiddleware) — re-runs the same
  // query, which naturally settles into `unauthenticated` once the session
  // really is gone, through the real query lifecycle rather than a
  // hand-forced local state transition.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      void reload();
    });
    return () => setUnauthenticatedHandler(null);
  }, [reload]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        apiClient.POST('/auth/refresh', {}).catch(() => {
          // A failed opportunistic refresh doesn't force a logout on its
          // own — if the session is genuinely gone, the next real request
          // surfaces 401 and unauthenticatedMiddleware already handles it.
        });
      }
    }, SESSION_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      await unwrap(apiClient.POST('/auth/login', { body: { identifier, password } }));
      await reload();
    },
    [reload],
  );

  const logout = useCallback(async () => {
    await unwrap(apiClient.POST('/auth/logout', {}));
    // The session cookie is now revoked server-side — re-running /auth/me
    // naturally settles into `unauthenticated`, the same path any other
    // 401 takes, rather than a separately-maintained local "logged out"
    // flag that could drift from what the server actually thinks.
    await reload();
  }, [reload]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, me, error, login, logout, reload }),
    [status, me, error, login, logout, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
