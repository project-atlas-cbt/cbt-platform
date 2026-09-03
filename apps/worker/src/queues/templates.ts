/**
 * `platform-subscription-warning`'s template name — kept here as the one
 * value `subscription-expiry.queue.ts` needs, so its enqueued payload
 * names the same template apps/api's `PlatformModule` registers
 * (`apps/api/src/modules/platform/templates.ts`).
 *
 * B10: this file previously also *rendered* this template directly, via
 * this process's own separate `TemplateRegistry`/`ConsoleNotificationChannel`
 * instance (`registerWorkerTemplates`, removed) — apps/worker had no Nest
 * DI, so it constructed and registered its own copy of the template
 * content, duplicated by hand from apps/api's. B10 retooled the expiry-
 * warning dispatch to go through the shared, retryable
 * `notification-dispatch` BullMQ queue instead (see
 * `subscription-expiry.queue.ts`'s own `SubscriptionExpirySweepDeps.
 * enqueueDispatch` doc comment) — the actual `.send()` call, and the
 * template rendering behind it, now happens in apps/api's worker-hosted
 * consumer (`notification-dispatch-worker-bootstrap.ts`), reusing the
 * *one* shared registry every module in that process already registers
 * templates against. This process no longer renders any template itself,
 * so the duplicate content/registration function is gone — only the name
 * (a plain string both processes must agree on) remains.
 */
export const SUBSCRIPTION_WARNING_TEMPLATE_NAME = 'platform-subscription-warning';
