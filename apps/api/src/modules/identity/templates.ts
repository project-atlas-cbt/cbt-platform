import type { TemplateRegistry } from '@atlas/notifications';

export const PASSWORD_RESET_TEMPLATE_NAME = 'auth-password-reset';
export const STAFF_INVITATION_TEMPLATE_NAME = 'auth-staff-invitation';

/**
 * ADR-0019's template pipeline (packages/notifications/src/template.ts) ships
 * no real product templates by design — each phase that sends a real
 * message registers its own against the shared registry. This is B1's:
 * staff password reset (and, since PasswordResetToken/confirm doesn't
 * distinguish "forgot" from "first credential", also a staff member's
 * initial invitation once B6 starts issuing those tokens the same way).
 */
export function registerIdentityTemplates(registry: TemplateRegistry): void {
  // Idempotent — the module may init more than once in tests.
  if (!registry.has(PASSWORD_RESET_TEMPLATE_NAME)) registerPasswordReset(registry);
  if (!registry.has(STAFF_INVITATION_TEMPLATE_NAME)) registerStaffInvitation(registry);
}

function registerPasswordReset(registry: TemplateRegistry): void {
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

function registerStaffInvitation(registry: TemplateRegistry): void {
  // P3-16: a new staff member is setting a password for the first time, so
  // "Reset your password" read as a mistake or a phishing attempt.
  registry.register({
    name: STAFF_INVITATION_TEMPLATE_NAME,
    subject: 'Your staff account at {{schoolName}}',
    text:
      'Hello {{displayName}},\n\n' +
      '{{schoolName}} has created a staff account for you. Use the link below to choose your ' +
      'password and sign in for the first time. It expires soon and can only be used once.\n\n' +
      '{{resetUrl}}\n\n' +
      'If the link has expired, ask your school administrator to send a new invitation.',
  });
}
