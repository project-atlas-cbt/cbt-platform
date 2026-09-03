'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * B10 — the read-side data layer for the in-app notification panel
 * (`GET /v1/notifications`). Modeled on `lib/imports/queries.ts`'s own
 * polling convention, but a **flat interval**, not that file's status-
 * conditional two-tier `pollingInterval` — there's no terminal/resting
 * state concept for a notification feed the way there is for a bounded
 * import job, so a fixed cadence is the honest match for F2's own roadmap
 * text ("Notification polling with a sensible interval; no realtime
 * requirement here"), not a ported backoff scheme that assumes a state
 * machine this data doesn't have.
 */
const POLL_INTERVAL_MS = 30_000;

export function useNotifications(params: { page?: number } = {}) {
  const page = params.page ?? 1;
  return useQuery({
    queryKey: ['notifications', page],
    queryFn: () => unwrap(apiClient.GET('/notifications', { params: { query: { page } } })),
    refetchInterval: POLL_INTERVAL_MS,
  });
}
