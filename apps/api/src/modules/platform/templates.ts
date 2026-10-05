import type { TemplateRegistry } from '@atlas/notifications';

export const SCHOOL_ACTIVATION_TEMPLATE_NAME = 'platform-school-activation';
export const SUBSCRIPTION_RENEWAL_TEMPLATE_NAME = 'platform-subscription-renewal';
export const SUBSCRIPTION_WARNING_TEMPLATE_NAME = 'platform-subscription-warning';
export const PLATFORM_PASSWORD_CHANGED_TEMPLATE_NAME = 'platform-password-changed';

/**
 * ADR-0019's template pipeline ships no real product templates by design —
 * each phase registers its own. B3's three: the emailed activation key/link
 * a newly-created (INVITED) School Admin receives (03 §3), the renewal key
 * an existing School Admin receives, and the pre-expiry warning (05 §4.2).
 *
 * Registered from two separate processes with two separate TemplateRegistry
 * instances — apps/api's PlatformModule (for POST /v1/platform/schools and
 * .../subscriptions, .../activation-grants) and apps/worker's bootstrap (for
 * the expiry sweeper's own warning dispatch, which has no Nest DI) — hence
 * this function lives at the top level rather than tied to either app's
 * lifecycle, and both call it the same way, each passing its own
 * `getProductName(env)` result (PROJECT.md: never hardcode the product
 * name — it's baked into the static template text at *registration* time
 * here, not re-supplied on every `.send()` call, since it never changes
 * per message).
 */
export function registerPlatformTemplates(registry: TemplateRegistry, productName: string): void {
  if (!registry.has(SCHOOL_ACTIVATION_TEMPLATE_NAME)) {
    registry.register({
      name: SCHOOL_ACTIVATION_TEMPLATE_NAME,
      subject: `Activate your ${productName} account`,
      text:
        'Hello {{displayName}},\n\n' +
        `An account has been created for you as the administrator of {{schoolName}} on ${productName}. ` +
        'Use the link below to activate your school and set your password. ' +
        'This link expires soon and can only be used once.\n\n' +
        '{{activationUrl}}\n\n' +
        "If you weren't expecting this, you can ignore this message.",
    });
  }

  if (!registry.has(SUBSCRIPTION_RENEWAL_TEMPLATE_NAME)) {
    registry.register({
      name: SUBSCRIPTION_RENEWAL_TEMPLATE_NAME,
      subject: `Your ${productName} renewal key`,
      text:
        'Hello {{displayName}},\n\n' +
        `A renewal key has been issued for {{schoolName}}'s ${productName} subscription. ` +
        'Enter it from your subscription screen to renew access. This key expires soon and ' +
        'can only be used once.\n\n' +
        'Renewal key: {{renewalKey}}\n\n' +
        "If you weren't expecting this, you can ignore this message.",
    });
  }

  if (!registry.has(SUBSCRIPTION_WARNING_TEMPLATE_NAME)) {
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

  // Security notice after a Software Admin changes their own password: the
  // only signal a hijacked session's owner gets, so it says what to do.
  if (!registry.has(PLATFORM_PASSWORD_CHANGED_TEMPLATE_NAME)) {
    registry.register({
      name: PLATFORM_PASSWORD_CHANGED_TEMPLATE_NAME,
      subject: `Your ${productName} password was changed`,
      text:
        'Hello {{displayName}},\n\n' +
        `The password for your ${productName} Software Admin account was changed on {{changedAt}}. ` +
        'Any other device signed in to this account has been signed out.\n\n' +
        'If you made this change, you do not need to do anything.\n\n' +
        'If you did not, someone else may have access to your account: tell the platform ' +
        'owner at once.',
    });
  }
}
