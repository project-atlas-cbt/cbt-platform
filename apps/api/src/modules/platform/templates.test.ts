import { TemplateRegistry } from '@atlas/notifications';
import { describe, expect, it } from 'vitest';
import { SOFTWARE_ADMIN_INVITATION_TEMPLATE } from '../../ops/create-software-admin.js';
import {
  registerPlatformTemplates,
  SCHOOL_ACTIVATION_TEMPLATE_NAME,
  SUBSCRIPTION_RENEWAL_TEMPLATE_NAME,
  SUBSCRIPTION_WARNING_TEMPLATE_NAME,
} from './templates.js';

// PROJECT.md: email subjects carry whatever PRODUCT_NAME is set to.
describe('platform email templates', () => {
  const variables = {
    displayName: 'Ada',
    schoolName: 'Kings College',
    activationUrl: 'https://kings.example/activate?key=k',
    renewalKey: 'RK-1',
    daysRemaining: 7,
    expiresAt: '2026-11-01',
  };

  it('name the configured product in every subject and body', () => {
    const registry = new TemplateRegistry();
    registerPlatformTemplates(registry, 'ExamKeep');
    for (const name of [
      SCHOOL_ACTIVATION_TEMPLATE_NAME,
      SUBSCRIPTION_RENEWAL_TEMPLATE_NAME,
      SUBSCRIPTION_WARNING_TEMPLATE_NAME,
    ]) {
      const mail = registry.render(name, variables);
      expect(mail.subject, name).toContain('ExamKeep');
      expect(mail.text, name).toContain('ExamKeep');
      expect(`${mail.subject}\n${mail.text}`, name).not.toMatch(/project atlas/i);
    }
  });

  it('name the configured product in the Software Admin invitation', () => {
    const registry = new TemplateRegistry();
    registry.register(SOFTWARE_ADMIN_INVITATION_TEMPLATE);
    const mail = registry.render(SOFTWARE_ADMIN_INVITATION_TEMPLATE.name, {
      productName: 'ExamKeep',
      signInUrl: 'https://admin.example',
      password: 'temp',
    });
    expect(mail.subject).toBe('Your ExamKeep platform account');
    expect(mail.text).toContain('A Software Admin account on ExamKeep');
  });
});
