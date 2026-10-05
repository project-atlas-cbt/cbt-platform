/**
 * Software Admin password change (2026-10-05, owner request): the operator
 * CLI's emailed temporary password is replaced at first sign-in, after
 * two-step setup, and an admin can change their password later too. Proves
 * the current-password check, the forced-change gate and its order after
 * the MFA gate, other sessions ending, the platform audit row and the
 * confirmation email.
 */
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createPrismaClient, prisma } from '@atlas/db';
import type { NotificationChannel } from '@atlas/notifications';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import { timeStep, totpAt } from '../../modules/platform/mfa/totp.js';
import { PlatformMfaService } from '../../modules/platform/mfa/platform-mfa.service.js';
import { PLATFORM_PASSWORD_CHANGED_TEMPLATE_NAME } from '../../modules/platform/templates.js';
import {
  ADMIN_HOST,
  bootSecurityApp,
  call,
  csrfContext,
  SecurityFixture,
  type Ctx,
} from '../../test-support/security-fixture.js';

// The fixture's own fixed password for every account it creates.
const PASSWORD = 'security-suite-password-123';
const NEW_PASSWORD = 'a-password-of-my-own-42';

let app: NestFastifyApplication;
let sendSpy: MockInstance<NotificationChannel['send']>;
const fixture = new SecurityFixture();

beforeAll(async () => {
  app = await bootSecurityApp();
  sendSpy = vi.spyOn(app.get<NotificationChannel>(NOTIFICATION_CHANNEL), 'send');
});

afterAll(async () => {
  await app.close();
  await prisma.platformMfaCredential
    .deleteMany({ where: { userId: { in: fixture.platformUserIds } } })
    .catch(() => undefined);
  await fixture.cleanup();
});

async function makeTemporary(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { credentialState: 'MUST_CHANGE_PASSWORD' },
  });
}

async function signInWith(email: string, password: string) {
  const ctx = await csrfContext(app, ADMIN_HOST);
  return call(app, ctx, 'POST', '/platform/auth/login', { email, password });
}

describe('Software Admin password change', () => {
  it('needs the current password, ends other sessions, audits and emails a notice', async () => {
    const admin = await fixture.createPlatformAdmin();
    const ctx = await fixture.loginPlatform(app, admin.email);
    const otherDevice = await fixture.loginPlatform(app, admin.email);

    const wrong = await call(app, ctx, 'POST', '/platform/auth/password/change', {
      currentPassword: 'not-the-password',
      newPassword: NEW_PASSWORD,
    });
    expect(wrong.statusCode).toBe(401);

    const same = await call(app, ctx, 'POST', '/platform/auth/password/change', {
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
    });
    expect(same.statusCode).toBe(400);

    const short = await call(app, ctx, 'POST', '/platform/auth/password/change', {
      currentPassword: PASSWORD,
      newPassword: 'short',
    });
    expect(short.statusCode).toBe(400);

    sendSpy.mockClear();
    const ok = await call(app, ctx, 'POST', '/platform/auth/password/change', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(ok.statusCode).toBe(200);

    expect((await call(app, ctx, 'GET', '/platform/auth/me')).statusCode).toBe(200);
    expect((await call(app, otherDevice, 'GET', '/platform/auth/me')).statusCode).toBe(401);
    expect((await signInWith(admin.email, PASSWORD)).statusCode).toBe(401);
    expect((await signInWith(admin.email, NEW_PASSWORD)).statusCode).toBe(200);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const sent = sendSpy.mock.calls[0]![0];
    expect(sent.to).toBe(admin.email);
    expect(sent.template).toBe(PLATFORM_PASSWORD_CHANGED_TEMPLATE_NAME);
    // Never the password itself.
    expect(JSON.stringify(sent)).not.toContain(NEW_PASSWORD);

    // Platform-level audit rows are readable only through atlas_audit_reader.
    const reader = createPrismaClient(process.env.DATABASE_AUDIT_READER_URL);
    try {
      const audit = await reader.auditEvent.findFirst({
        where: { action: 'PLATFORM_PASSWORD_CHANGED', entityId: admin.userId },
      });
      expect(audit?.schoolId).toBeNull();
      expect(audit?.actorUserId).toBe(admin.userId);
      expect(audit?.metadata).toMatchObject({ otherSessionsRevoked: 1, wasTemporary: false });
    } finally {
      await reader.$disconnect();
    }
  });

  it('confines an admin on a temporary password to the change route, then lifts', async () => {
    const admin = await fixture.createPlatformAdmin();
    await makeTemporary(admin.userId);
    const ctx = await fixture.loginPlatform(app, admin.email);

    const blocked = await call(app, ctx, 'GET', '/platform/schools');
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const me = await call(app, ctx, 'GET', '/platform/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json<{ mustChangePassword: boolean }>().mustChangePassword).toBe(true);

    // The temporary password is still required to replace it.
    const noCurrent = await call(app, ctx, 'POST', '/platform/auth/password/change', {
      newPassword: NEW_PASSWORD,
    });
    expect(noCurrent.statusCode).toBe(400);

    const ok = await call(app, ctx, 'POST', '/platform/auth/password/change', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(ok.statusCode).toBe(200);
    expect((await call(app, ctx, 'GET', '/platform/schools')).statusCode).toBe(200);
    expect(
      (await call(app, ctx, 'GET', '/platform/auth/me')).json<{ mustChangePassword: boolean }>()
        .mustChangePassword,
    ).toBe(false);
  });

  describe('with two-step sign-in required', () => {
    let restore: () => void = () => undefined;

    beforeAll(() => {
      const spy = vi.spyOn(app.get(PlatformMfaService), 'isRequired').mockReturnValue(true);
      restore = () => spy.mockRestore();
    });

    afterAll(() => restore());

    it('asks for two-step setup first, then the new password', async () => {
      const admin = await fixture.createPlatformAdmin();
      await makeTemporary(admin.userId);
      const ctx: Ctx = await fixture.loginPlatform(app, admin.email);

      const early = await call(app, ctx, 'POST', '/platform/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expect(early.json<{ error: { code: string } }>().error.code).toBe('MFA_ENROLMENT_REQUIRED');

      const { secret } = (await call(app, ctx, 'POST', '/platform/auth/mfa/enrol')).json<{
        secret: string;
      }>();
      const confirm = await call(app, ctx, 'POST', '/platform/auth/mfa/enrol/confirm', {
        otp: totpAt(secret, timeStep()),
      });
      expect(confirm.statusCode).toBe(200);

      const next = await call(app, ctx, 'GET', '/platform/schools');
      expect(next.json<{ error: { code: string } }>().error.code).toBe('PASSWORD_CHANGE_REQUIRED');
      const ok = await call(app, ctx, 'POST', '/platform/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expect(ok.statusCode).toBe(200);
      expect((await call(app, ctx, 'GET', '/platform/schools')).statusCode).toBe(200);
    });
  });
});
