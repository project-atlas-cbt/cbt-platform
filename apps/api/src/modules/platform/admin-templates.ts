import type { TemplateRegistry } from '@atlas/notifications';

export const PLATFORM_SECURITY_ALERT_TEMPLATE_NAME = 'platform-security-alert';
export const PLATFORM_SETTINGS_CHANGED_TEMPLATE_NAME = 'platform-settings-changed';
export const PLATFORM_TEST_EMAIL_TEMPLATE_NAME = 'platform-test-email';

/**
 * Emails only Software Admins receive. Sign-in Security gap-closure: an email to a Software Admin whenever their
 * second factor changes (turned on, turned off, reset by a colleague, new
 * recovery codes). The standard "was this you?" notice — the change itself
 * is already audited; this tells the account's owner in case it wasn't
 * them. `{{change}}` is one sentence chosen by the service, never user
 * input. The product name is baked in at registration (PROJECT.md).
 */
export function registerPlatformAdminTemplates(
  registry: TemplateRegistry,
  productName: string,
): void {
  if (!registry.has(PLATFORM_SETTINGS_CHANGED_TEMPLATE_NAME)) {
    // ADR-0036: every other Software Admin hears about a System
    // Configuration change, with the reason given.
    registry.register({
      name: PLATFORM_SETTINGS_CHANGED_TEMPLATE_NAME,
      subject: `${productName} System Configuration was changed`,
      text:
        'Hello {{displayName}},\n\n' +
        '{{actorName}} changed these platform settings:\n\n' +
        '{{summary}}\n\n' +
        'Reason given: {{reason}}\n\n' +
        'Every change is in the platform audit log.',
    });
  }
  if (!registry.has(PLATFORM_TEST_EMAIL_TEMPLATE_NAME)) {
    registry.register({
      name: PLATFORM_TEST_EMAIL_TEMPLATE_NAME,
      subject: `${productName} test email`,
      text:
        'Hello {{displayName}},\n\n' +
        `This is a test email from ${productName} System Configuration. ` +
        'It was sent from {{sender}}. If you are reading it, email is working.',
    });
  }
  if (registry.has(PLATFORM_SECURITY_ALERT_TEMPLATE_NAME)) return;
  registry.register({
    name: PLATFORM_SECURITY_ALERT_TEMPLATE_NAME,
    subject: `Sign-in security changed on your ${productName} account`,
    text:
      'Hello {{displayName}},\n\n' +
      '{{change}}\n\n' +
      'When: {{occurredAt}}\n\n' +
      "If this wasn't you, ask another Software Admin to reset your two-step sign-in " +
      'and sign out your other sessions straight away.',
  });
}
