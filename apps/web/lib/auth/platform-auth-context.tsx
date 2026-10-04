'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, NetworkError, unwrap } from '@/lib/api';
import type { PlatformAuthStatus, PlatformMe } from './types';

/**
 * The Software Admin equivalent of `auth-context.tsx`'s `AuthProvider` —
 * built as a deliberately separate, parallel provider rather than a variant
 * of `AuthProvider`, mirroring the backend's own convention for the two
 * session mechanisms (`CLAUDE.md`'s B3 notes: "`PlatformSessionService`/
 * `PlatformAuthGuard`/`PlatformAuthService` parallel the identity module's
 * own... by convention, not by shared code"). F3 is the first phase to
 * actually reach `/platform/auth/*` from the frontend — `/admin/(shell)`
 * (F2) built the chrome ahead of this existing.
 *
 * No forced-password-change branch, no `error` field, no opportunistic
 * refresh interval: B3 shipped none of the machinery those would react to
 * for a platform account (no password-change endpoint; `PlatformSession`'s
 * own TTL is long-lived enough that F3 doesn't need a refresh loop to prove
 * — a later phase can add one the same way `AuthProvider` did if it turns
 * out to matter). Kept deliberately smaller than `AuthProvider`, not
 * artificially parallel in every detail.
 */
const PLATFORM_ME_QUERY_KEY = ['platform-auth', 'me'] as const;

/** F20 (B20 MFA): an enrolled admin's password alone never creates a
 * session — the server answers `mfa_required` with a short-lived challenge
 * token for the second step. */
export type PlatformLoginResult =
  { status: 'ok' } | { status: 'mfa_required'; challengeToken: string };

interface PlatformAuthContextValue {
  status: PlatformAuthStatus;
  me: PlatformMe | null;
  login: (email: string, password: string) => Promise<PlatformLoginResult>;
  /** Second step with a 6-digit authenticator code. */
  verifyOtp: (challengeToken: string, otp: string) => Promise<void>;
  /** Second step with a one-time recovery code. */
  verifyRecovery: (challengeToken: string, recoveryCode: string) => Promise<void>;
  logout: () => Promise<void>;
}

const PlatformAuthContext = createContext<PlatformAuthContextValue | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: PLATFORM_ME_QUERY_KEY,
    queryFn: () => unwrap(apiClient.GET('/platform/auth/me', {})),
    retry: (failureCount, err) => err instanceof NetworkError && failureCount < 2,
    staleTime: Infinity,
  });

  const status: PlatformAuthStatus = meQuery.isPending
    ? 'loading'
    : meQuery.isSuccess
      ? 'authenticated'
      : 'unauthenticated';

  const me = meQuery.data ?? null;

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: PLATFORM_ME_QUERY_KEY });
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string): Promise<PlatformLoginResult> => {
      const result = await unwrap(
        apiClient.POST('/platform/auth/login', { body: { email, password } }),
      );
      if (result.status === 'mfa_required' && result.challengeToken) {
        return { status: 'mfa_required', challengeToken: result.challengeToken };
      }
      await reload();
      return { status: 'ok' };
    },
    [reload],
  );

  const verifyOtp = useCallback(
    async (challengeToken: string, otp: string) => {
      await unwrap(apiClient.POST('/platform/auth/mfa/verify', { body: { challengeToken, otp } }));
      await reload();
    },
    [reload],
  );

  const verifyRecovery = useCallback(
    async (challengeToken: string, recoveryCode: string) => {
      await unwrap(
        apiClient.POST('/platform/auth/mfa/recovery', { body: { challengeToken, recoveryCode } }),
      );
      await reload();
    },
    [reload],
  );

  const logout = useCallback(async () => {
    await unwrap(apiClient.POST('/platform/auth/logout', {}));
    await reload();
  }, [reload]);

  const value = useMemo<PlatformAuthContextValue>(
    () => ({ status, me, login, verifyOtp, verifyRecovery, logout }),
    [status, me, login, verifyOtp, verifyRecovery, logout],
  );

  return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
}

export function usePlatformAuth(): PlatformAuthContextValue {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) {
    throw new Error('usePlatformAuth must be used within <PlatformAuthProvider>');
  }
  return ctx;
}
