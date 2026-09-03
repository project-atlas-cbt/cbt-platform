'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * B10 — the write-side data layer for notification read-state. Modeled on
 * `lib/question-review/mutations.ts`'s `invalidateReviews` shape:
 * invalidating the whole `['notifications']` key re-fetches both the list
 * and the derived `unreadCount` together in one round-trip, rather than
 * patching the cache by hand.
 */
function invalidateNotifications(client: QueryClient) {
  return client.invalidateQueries({ queryKey: ['notifications'], exact: false });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/notifications/{id}/read', { params: { path: { id } } })),
    onSuccess: () => invalidateNotifications(client),
  });
}

export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(apiClient.POST('/notifications/read-all', {})),
    onSuccess: () => invalidateNotifications(client),
  });
}
