import type { TemplateRegistry } from '@atlas/notifications';

export const PLATFORM_SECURITY_ALERT_TEMPLATE_NAME = 'platform-security-alert';

/**
 * Sign-in Security gap-closure: an email to a Software Admin whenever their
 * second factor changes (turned on, turned off, reset by a colleague, new
 * recovery codes). The standard "was this you?" notice — the change itself
 * is already audited; this tells the account's owner in case it wasn't
 * them. `{{change}}` is one sentence chosen by the service, never user
 * input. The product name is baked in at registration (PROJECT.md).
 */
export function registerPlatformSecurityTemplates(
  registry: TemplateRegistry,
  productName: string,
): void {
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
