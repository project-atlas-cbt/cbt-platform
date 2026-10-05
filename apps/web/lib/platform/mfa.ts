'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F20 (carried from B20) — Software Admin MFA: own status, enrolment,
 * disable, and peer reset. Never optimistic: every change re-reads the
 * server's status.
 */

export const MFA_STATUS_QUERY_KEY = ['platform', 'mfa', 'status'] as const;

export function useMfaStatus() {
  return useQuery({
    queryKey: MFA_STATUS_QUERY_KEY,
    queryFn: () => unwrap(apiClient.GET('/platform/auth/mfa', {})),
  });
}

/** Starts (or restarts — the server replaces an unconfirmed secret)
 * enrolment; returns the shared secret and its `otpauth://` URI. */
export function useStartMfaEnrolment() {
  return useMutation({
    mutationFn: () => unwrap(apiClient.POST('/platform/auth/mfa/enrol', {})),
  });
}

/** Confirms enrolment with a first code; returns the recovery codes — the
 * only time they are ever shown. Ends every other session of this admin. */
export function useConfirmMfaEnrolment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (otp: string) =>
      unwrap(apiClient.POST('/platform/auth/mfa/enrol/confirm', { body: { otp } })),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['platform'] }),
  });
}

export function useDisableMfa() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (otp: string) =>
      unwrap(apiClient.POST('/platform/auth/mfa/disable', { body: { otp } })),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['platform'] }),
  });
}

/** `GET /platform/admins` (F20 backend gap-closure) — peers for MFA reset. */
export function usePlatformAdmins(enabled = true) {
  return useQuery({
    queryKey: ['platform', 'admins'],
    queryFn: () => unwrap(apiClient.GET('/platform/admins', {})),
    enabled,
  });
}

/** Clears a peer's lost second factor (reason required, audited; ends
 * their sessions). */
export function useResetPeerMfa() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: string; reason: string }) =>
      unwrap(apiClient.POST('/platform/auth/mfa/reset', { body })),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['platform', 'admins'] }),
  });
}

/** Replaces every recovery code with a new set, shown once. Needs a
 * current code; the old codes stop working at once. */
export function useRegenerateRecoveryCodes() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (otp: string) =>
      unwrap(apiClient.POST('/platform/auth/mfa/recovery-codes', { body: { otp } })),
    onSuccess: () => void client.invalidateQueries({ queryKey: MFA_STATUS_QUERY_KEY }),
  });
}

export const PLATFORM_SESSIONS_QUERY_KEY = ['platform', 'sessions'] as const;

/** The signed-in admin's own live sessions, the current one marked. */
export function usePlatformSessions() {
  return useQuery({
    queryKey: PLATFORM_SESSIONS_QUERY_KEY,
    queryFn: () => unwrap(apiClient.GET('/platform/auth/sessions', {})),
  });
}

export function useSignOutOtherSessions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(apiClient.POST('/platform/auth/sessions/sign-out-others', {})),
    onSuccess: () => void client.invalidateQueries({ queryKey: PLATFORM_SESSIONS_QUERY_KEY }),
  });
}
