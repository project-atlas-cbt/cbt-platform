import type { TemplateRegistry } from '@atlas/notifications';

export const PASSWORD_RESET_TEMPLATE_NAME = 'auth-password-reset';

/**
 * ADR-0019's template pipeline (packages/notifications/src/template.ts) ships
 * no real product templates by design — each phase that sends a real
 * message registers its own against the shared registry. This is B1's:
 * staff password reset (and, since PasswordResetToken/confirm doesn't
 * distinguish "forgot" from "first credential", also a staff member's
 * initial invitation once B6 starts issuing those tokens the same way).
 */
export function registerIdentityTemplates(registry: TemplateRegistry): void {
  if (registry.has(PASSWORD_RESET_TEMPLATE_NAME)) return; // idempotent — module may init more than once in tests
  registry.register({
    name: PASSWORD_RESET_TEMPLATE_NAME,
    subject: 'Reset your password',
    text:
      'Hello {{displayName}},\n\n' +
      'Use the link below to reset your password. It expires soon and can only be used once.\n\n' +
      '{{resetUrl}}\n\n' +
      "If you didn't request this, you can ignore this message.",
  });
}
