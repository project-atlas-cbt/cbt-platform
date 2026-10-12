import { TemplateRegistry } from '@atlas/notifications';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_GUIDE_PRODUCT_NAME } from './onboarding-guide.generated.js';
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
    guideUrl: 'https://example/get-started',
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

  it('attaches the onboarding guide PDF to the activation email, for its own product only', () => {
    const own = new TemplateRegistry();
    registerPlatformTemplates(own, ONBOARDING_GUIDE_PRODUCT_NAME);
    const mail = own.render(SCHOOL_ACTIVATION_TEMPLATE_NAME, variables);
    expect(mail.text).toContain('https://example/get-started');
    expect(mail.attachments).toHaveLength(1);
    expect(Buffer.from(mail.attachments![0]!.content).subarray(0, 5).toString()).toBe('%PDF-');

    const other = new TemplateRegistry();
    registerPlatformTemplates(other, 'SomeOtherName');
    expect(other.render(SCHOOL_ACTIVATION_TEMPLATE_NAME, variables).attachments).toBeUndefined();
  });
});
