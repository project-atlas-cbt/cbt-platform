'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F5's read-side data layer for `/school/settings/*`. Query keys match
 * `lib/onboarding/queries.ts`'s own (`['school','profile']`,
 * `['school','branding']`) so a mutation from either surface invalidates
 * the other — this codebase's established convention (each phase owns its
 * own thin wrappers around a shared cache key, e.g. `lib/platform/*`), not
 * a forced merge into one shared module.
 */

export function useSchoolProfile() {
  return useQuery({
    queryKey: ['school', 'profile'],
    queryFn: () => unwrap(apiClient.GET('/school/profile', {})),
  });
}

export function useSchoolBranding() {
  return useQuery({
    queryKey: ['school', 'branding'],
    queryFn: () => unwrap(apiClient.GET('/school/branding', {})),
  });
}

export function useResultPolicy() {
  return useQuery({
    queryKey: ['school', 'result-policy'],
    queryFn: () => unwrap(apiClient.GET('/school/result-policy', {})),
  });
}

export function useSubscriptionStatus() {
  return useQuery({
    queryKey: ['school', 'subscription'],
    queryFn: () => unwrap(apiClient.GET('/school/subscription', {})),
  });
}

/** ADR-0018 / B15 — the school's grading scales (current version's bands)
 * plus the default template offered as a starting point. */
export function useGradingScales() {
  return useQuery({
    queryKey: ['school', 'grading-scales'],
    queryFn: () => unwrap(apiClient.GET('/school/grading-scales', {})),
  });
}

/** Every version of one scale, newest first, each flagged `inUse` when a
 * result was graded against it. Disabled until a scale exists. */
export function useGradingScaleVersions(scaleId: string | undefined) {
  return useQuery({
    queryKey: ['school', 'grading-scales', scaleId, 'versions'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/school/grading-scales/{id}/versions', {
          params: { path: { id: scaleId ?? '' } },
        }),
      ),
    enabled: scaleId !== undefined,
  });
}
