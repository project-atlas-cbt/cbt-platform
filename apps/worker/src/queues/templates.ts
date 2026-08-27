import type { TemplateRegistry } from '@atlas/notifications';

export const SUBSCRIPTION_WARNING_TEMPLATE_NAME = 'platform-subscription-warning';

/**
 * apps/worker has its own TemplateRegistry instance (no Nest DI, no shared
 * process with apps/api) — this process only ever sends the pre-expiry
 * warning (the other two B3 templates, activation/renewal, are only ever
 * sent from apps/api's PlatformModule, which owns the endpoints that issue
 * those keys). Content deliberately mirrors
 * apps/api/src/modules/platform/templates.ts's own
 * `SUBSCRIPTION_WARNING_TEMPLATE_NAME` registration exactly — duplicated
 * rather than imported (apps/worker cannot depend on apps/api, and neither
 * app depends on the other by design), the same "convention reuse, not
 * literal code sharing" precedent as PlatformSessionService's cookie
 * signing and packages/db/prisma/seed.ts's Argon2 profile. Since each
 * process only ever renders templates it registered itself, the two
 * copies never need to be the exact same object — only internally
 * consistent within each process, matching identity/templates.ts's own
 * register-then-send-in-the-same-module pattern.
 */
export function registerWorkerTemplates(registry: TemplateRegistry, productName: string): void {
  if (registry.has(SUBSCRIPTION_WARNING_TEMPLATE_NAME)) return;
  registry.register({
    name: SUBSCRIPTION_WARNING_TEMPLATE_NAME,
    subject: `{{schoolName}}'s ${productName} subscription expires in {{daysRemaining}} day(s)`,
    text:
      'Hello {{displayName}},\n\n' +
      `{{schoolName}}'s ${productName} subscription expires on {{expiresAt}} ` +
      '({{daysRemaining}} day(s) from now). Renew before then to avoid any interruption. ' +
      'Existing examinations and historical data are never affected by an expired ' +
      'subscription, but new activity is blocked after expiry.\n\n' +
      'Visit your subscription screen to renew.',
  });
}
