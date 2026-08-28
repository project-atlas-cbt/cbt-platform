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
