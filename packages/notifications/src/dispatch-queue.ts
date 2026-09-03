/**
 * B10: the cross-process contract for out-of-band notification dispatch
 * with retry (ADR-0019's own "Required changes" line for this phase).
 *
 * The consumer lives in `apps/api` (see `notification-dispatch-worker-
 * bootstrap.ts` there) — it reuses the one shared `NOTIFICATION_CHANNEL`/
 * `NOTIFICATION_TEMPLATE_REGISTRY` singleton every module in that process
 * already registers templates against, rather than `apps/worker`'s own,
 * separate, independent registry (which would need every template
 * hand-duplicated a second time, as it already does today for just one —
 * `SUBSCRIPTION_WARNING_TEMPLATE_NAME`).
 *
 * `apps/worker` cannot import `apps/api/src` at all (only `packages/*` are
 * shared across apps) but already depends on `@atlas/notifications` for
 * `ConsoleNotificationChannel`/`TemplateRegistry` — the natural, already-
 * shared home for this queue name/payload contract, so its own jobs (e.g.
 * the subscription-expiry sweep) can become cross-process *producers* onto
 * this same queue, over the shared Redis, without a new dependency.
 */
export const NOTIFICATION_DISPATCH_QUEUE_NAME = 'atlas-notification-dispatch';

export interface NotificationDispatchJobPayload {
  to: string;
  template: string;
  variables?: Record<string, string | number>;
}
