'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/** F5's write-side data layer for `/school/settings/*` — no optimistic
 * updates (this codebase's established convention), invalidate-on-success
 * only. */

export function useUpdateSchoolProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name?: string;
      shortName?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
    }) => unwrap(apiClient.PATCH('/school/profile', { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['school', 'profile'] }),
  });
}

export function useUpdateResultPolicy() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      resultPolicy?: 'TEACHER' | 'SCHOOL_ADMIN' | 'AUTOMATIC';
      resultDetailVisibility?: 'SCORE_ONLY' | 'SCORE_AND_COUNTS' | 'FULL_REVIEW';
      resultPolicyLocked?: boolean;
    }) => unwrap(apiClient.PUT('/school/result-policy', { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['school', 'result-policy'] }),
  });
}

/** ADR-0018: every save creates a new scale version — bands are never
 * edited in place. Invalidates both the scale list and its version history
 * (the shared `['school','grading-scales']` prefix covers both). */
export function usePutGradingScale() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      scaleId?: string;
      name: string;
      /** Absent for the school-wide scale. */
      level?: 'JSS1' | 'JSS2' | 'JSS3' | 'SS1' | 'SS2' | 'SS3';
      bands: { label: string; minPercentage: number; maxPercentage: number; isPassing: boolean }[];
    }) => unwrap(apiClient.PUT('/school/grading-scales', { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['school', 'grading-scales'] }),
  });
}
