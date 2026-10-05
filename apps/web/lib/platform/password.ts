'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * Software Admin password change (2026-10-05). The current password is
 * always required, the emailed temporary one included. On success the
 * server ends every other session and emails a notice; `me` is re-read so
 * the first-sign-in gate lifts.
 */
export function useChangePlatformPassword() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      unwrap(apiClient.POST('/platform/auth/password/change', { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['platform-auth', 'me'] }),
  });
}
