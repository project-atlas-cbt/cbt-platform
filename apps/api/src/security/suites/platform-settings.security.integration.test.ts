/**
 * ADR-0036 System Configuration — end to end through the API: the settings
 * list with sources, limits enforced by the server, audited changes with a
 * reason, the email to the other Software Admins, reset to default, the
 * change reaching a consumer through the settings cache, and the test email.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createPrismaClient, prisma } from '@atlas/db';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';
import {
  PLATFORM_SETTINGS_CHANGED_TEMPLATE_NAME,
  PLATFORM_TEST_EMAIL_TEMPLATE_NAME,
} from '../../modules/platform/admin-templates.js';
import { bootSecurityApp, call, SecurityFixture } from '../../test-support/security-fixture.js';

let app: NestFastifyApplication;
const fixture = new SecurityFixture();

interface SettingRow {
  key: string;
  value: unknown;
  defaultValue: unknown;
  overridden: boolean;
  updatedBy: string | null;
}

beforeAll(async () => {
  app = await bootSecurityApp();
});

afterEach(async () => {
  await prisma.platformSetting.deleteMany({});
  app.get(PlatformSettingsService).invalidate();
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

const find = (rows: SettingRow[], key: string) => rows.find((r) => r.key === key)!;

describe('System Configuration (ADR-0036)', () => {
  it('lists every editable setting at its env default', async () => {
    const admin = await fixture.createPlatformAdmin();
    const ctx = await fixture.loginPlatform(app, admin.email);
    const res = await call(app, ctx, 'GET', '/platform/settings');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ settings: SettingRow[]; environment: { emailTransport: string } }>();
    expect(body.settings).toHaveLength(10);
    expect(body.settings.every((s) => !s.overridden)).toBe(true);
    const lockout = find(body.settings, 'authLockoutMaxAttempts');
    expect(lockout.value).toBe(Number(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS ?? 5));
    expect(body.environment.emailTransport).toBe('console');
    // Secrets and infrastructure are never part of it.
    expect(JSON.stringify(body)).not.toMatch(/SMTP_PASSWORD|CSRF_SECRET|DATABASE/u);
  });

  it('refuses values outside the limits and changes nothing', async () => {
    const admin = await fixture.createPlatformAdmin();
    const ctx = await fixture.loginPlatform(app, admin.email);
    const res = await call(app, ctx, 'PATCH', '/platform/settings', {
      changes: [
        { key: 'authLockoutMaxAttempts', value: 1 },
        { key: 'opsAlertEmails', value: ['not-an-email'] },
        { key: 'schoolSessionTtlSeconds', value: 2 * 86400 },
      ],
      reason: 'Testing limits',
    });
    expect(res.statusCode).toBe(400);
    const error = res.json<{ error: { details: { fields: Record<string, string> } } }>().error;
    expect(Object.keys(error.details.fields).sort()).toEqual([
      'authLockoutMaxAttempts',
      'opsAlertEmails',
    ]);
    expect(await prisma.platformSetting.count()).toBe(0);

    const noReason = await call(app, ctx, 'PATCH', '/platform/settings', {
      changes: [{ key: 'authLockoutMaxAttempts', value: 7 }],
    });
    expect(noReason.statusCode).toBe(400);
    const unknownKey = await call(app, ctx, 'PATCH', '/platform/settings', {
      changes: [{ key: 'CSRF_SECRET', value: 'x' }],
      reason: 'Trying to reach a secret',
    });
    expect(unknownKey.statusCode).toBe(400);
  });

  it('applies a change: audited, other admins emailed, consumers see it; reset returns the default', async () => {
    const channel = app.get<{ send: (m: { to: string; template: string }) => Promise<void> }>(
      NOTIFICATION_CHANNEL,
    );
    const send = vi.spyOn(channel, 'send');
    try {
      const admin = await fixture.createPlatformAdmin();
      const colleague = await fixture.createPlatformAdmin();
      const ctx = await fixture.loginPlatform(app, admin.email);

      const res = await call(app, ctx, 'PATCH', '/platform/settings', {
        changes: [
          { key: 'authLockoutMaxAttempts', value: 7 },
          { key: 'opsAlertEmails', value: ['Ops@Example.test', 'ops@example.test'] },
          { key: 'emailSenderName', value: '  Pilot Team ' },
        ],
        reason: 'Pilot tuning',
      });
      expect(res.statusCode).toBe(200);
      const rows = res.json<{ settings: SettingRow[] }>().settings;
      expect(find(rows, 'authLockoutMaxAttempts')).toMatchObject({ value: 7, overridden: true });
      expect(find(rows, 'opsAlertEmails').value).toEqual(['ops@example.test']);
      expect(find(rows, 'emailSenderName').value).toBe('Pilot Team');
      expect(find(rows, 'authLockoutMaxAttempts').updatedBy).toBeTruthy();

      const settings = app.get(PlatformSettingsService);
      expect((await settings.current()).authLockoutMaxAttempts).toBe(7);
      expect((await settings.current()).emailSenderName).toBe('Pilot Team');

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: colleague.email,
          template: PLATFORM_SETTINGS_CHANGED_TEMPLATE_NAME,
        }),
      );
      expect(send).not.toHaveBeenCalledWith(
        expect.objectContaining({
          to: admin.email,
          template: PLATFORM_SETTINGS_CHANGED_TEMPLATE_NAME,
        }),
      );

      const reader = createPrismaClient(process.env.DATABASE_AUDIT_READER_URL);
      try {
        const audits = await reader.auditEvent.findMany({
          where: { schoolId: null, actorUserId: admin.userId, action: 'PLATFORM_SETTING_CHANGED' },
        });
        expect(audits).toHaveLength(3);
        const lockoutAudit = audits.find(
          (a) => (a.metadata as { key: string }).key === 'authLockoutMaxAttempts',
        );
        expect(lockoutAudit?.reason).toBe('Pilot tuning');
        expect(lockoutAudit?.metadata).toMatchObject({ to: 7 });
      } finally {
        await reader.$disconnect();
      }

      const reset = await call(app, ctx, 'PATCH', '/platform/settings', {
        changes: [{ key: 'authLockoutMaxAttempts', value: null }],
        reason: 'Back to the default',
      });
      expect(reset.statusCode).toBe(200);
      const lockout = find(
        reset.json<{ settings: SettingRow[] }>().settings,
        'authLockoutMaxAttempts',
      );
      expect(lockout.overridden).toBe(false);
      expect(lockout.value).toBe(lockout.defaultValue);
      expect(
        await prisma.platformSetting.findUnique({ where: { key: 'authLockoutMaxAttempts' } }),
      ).toBeNull();
    } finally {
      send.mockRestore();
    }
  });

  it('keeps the sender on the verified domain', async () => {
    const admin = await fixture.createPlatformAdmin();
    const ctx = await fixture.loginPlatform(app, admin.email);
    const settings = app.get(PlatformSettingsService);
    const verified = (await settings.current()).emailSenderAddress.split('@')[1];
    const res = await call(app, ctx, 'PATCH', '/platform/settings', {
      changes: [{ key: 'emailSenderAddress', value: 'someone@elsewhere.test' }],
      reason: 'Wrong domain',
    });
    // With no env sender (console transport in tests) any domain is allowed.
    expect(res.statusCode).toBe(verified ? 400 : 200);
  });

  it('sends a test email to the signed-in admin', async () => {
    const channel = app.get<{ send: (m: { to: string; template: string }) => Promise<void> }>(
      NOTIFICATION_CHANNEL,
    );
    const send = vi.spyOn(channel, 'send');
    try {
      const admin = await fixture.createPlatformAdmin();
      const ctx = await fixture.loginPlatform(app, admin.email);
      const res = await call(app, ctx, 'POST', '/platform/settings/test-email');
      expect(res.statusCode).toBe(200);
      expect(res.json<{ sentTo: string }>().sentTo).toBe(admin.email);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ to: admin.email, template: PLATFORM_TEST_EMAIL_TEMPLATE_NAME }),
      );

      send.mockRejectedValueOnce(new Error('550 sender not verified'));
      const failed = await call(app, ctx, 'POST', '/platform/settings/test-email');
      expect(failed.statusCode).toBe(503);
      expect(failed.json<{ error: { message: string } }>().error.message).toMatch(/not verified/u);
    } finally {
      send.mockRestore();
    }
  });
});
