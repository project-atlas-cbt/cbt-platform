/**
 * B20 Software Admin TOTP MFA (08 §16 "stronger controls" for administrative
 * operations; project-owner decision 2026-10-02) — end to end through the
 * API: enrolment, two-step sign-in, replay and brute-force resistance,
 * recovery codes, self-disable, peer reset, platform-level auditing, and
 * the PLATFORM_MFA_REQUIRED enforcement gate.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createPrismaClient, prisma } from '@atlas/db';
import { timeStep, totpAt } from '../../modules/platform/mfa/totp.js';
import { PlatformMfaService } from '../../modules/platform/mfa/platform-mfa.service.js';
import { PLATFORM_SECURITY_ALERT_TEMPLATE_NAME } from '../../modules/platform/admin-templates.js';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import {
  ADMIN_HOST,
  bootSecurityApp,
  call,
  csrfContext,
  extractCookie,
  SecurityFixture,
  type Ctx,
} from '../../test-support/security-fixture.js';

const PASSWORD = 'security-suite-password-123';
let app: NestFastifyApplication;
const fixture = new SecurityFixture();

beforeAll(async () => {
  app = await bootSecurityApp();
});

afterAll(async () => {
  await app.close();
  await prisma.platformMfaCredential
    .deleteMany({ where: { userId: { in: fixture.platformUserIds } } })
    .catch(() => undefined);
  await fixture.cleanup();
});

async function passwordStep(email: string) {
  const ctx = await csrfContext(app, ADMIN_HOST);
  const res = await call(app, ctx, 'POST', '/platform/auth/login', { email, password: PASSWORD });
  return { ctx, res, body: res.json<{ status: string; challengeToken?: string }>() };
}

async function enrol(ctx: Ctx): Promise<{ secret: string; recoveryCodes: string[]; step: number }> {
  const start = await call(app, ctx, 'POST', '/platform/auth/mfa/enrol');
  expect(start.statusCode).toBe(200);
  const { secret, otpauthUri } = start.json<{ secret: string; otpauthUri: string }>();
  expect(otpauthUri).toMatch(/^otpauth:\/\/totp\//u);
  const step = timeStep();
  const confirm = await call(app, ctx, 'POST', '/platform/auth/mfa/enrol/confirm', {
    otp: totpAt(secret, step),
  });
  expect(confirm.statusCode).toBe(200);
  return { secret, recoveryCodes: confirm.json<{ recoveryCodes: string[] }>().recoveryCodes, step };
}

describe('Software Admin MFA', () => {
  it('enrolment ends other sessions; sign-in then needs a second step; codes cannot be replayed', async () => {
    const admin = await fixture.createPlatformAdmin();
    const primary = await fixture.loginPlatform(app, admin.email);
    const otherDevice = await fixture.loginPlatform(app, admin.email);

    const { secret, recoveryCodes, step } = await enrol(primary);
    expect(recoveryCodes).toHaveLength(10);
    expect((await call(app, otherDevice, 'GET', '/platform/auth/me')).statusCode).toBe(401);
    expect((await call(app, primary, 'GET', '/platform/auth/me')).statusCode).toBe(200);

    // Password alone no longer yields a session.
    const { ctx, res, body } = await passwordStep(admin.email);
    expect(body.status).toBe('mfa_required');
    expect(extractCookie(res.headers['set-cookie'], 'atlas_platform_session')).toBeUndefined();

    // The code already used to confirm enrolment is spent (replay).
    const replay = await call(app, ctx, 'POST', '/platform/auth/mfa/verify', {
      challengeToken: body.challengeToken,
      otp: totpAt(secret, step),
    });
    expect(replay.statusCode).toBe(401);

    const ok = await call(app, ctx, 'POST', '/platform/auth/mfa/verify', {
      challengeToken: body.challengeToken,
      otp: totpAt(secret, step + 1),
    });
    expect(ok.statusCode).toBe(200);
    const session = extractCookie(ok.headers['set-cookie'], 'atlas_platform_session');
    expect(session).toBeDefined();
    const signedIn: Ctx = {
      ...ctx,
      sessionCookieName: 'atlas_platform_session',
      sessionCookie: session!,
    };
    expect((await call(app, signedIn, 'GET', '/platform/auth/me')).statusCode).toBe(200);

    // A challenge is single-use.
    const again = await call(app, ctx, 'POST', '/platform/auth/mfa/verify', {
      challengeToken: body.challengeToken,
      otp: totpAt(secret, step + 1),
    });
    expect(again.statusCode).toBe(401);
  });

  it('five wrong codes destroy the challenge; recovery codes are single-use', async () => {
    const admin = await fixture.createPlatformAdmin();
    const ctx0 = await fixture.loginPlatform(app, admin.email);
    const { secret, recoveryCodes, step } = await enrol(ctx0);

    const first = await passwordStep(admin.email);
    for (let i = 0; i < 5; i += 1) {
      const bad = await call(app, first.ctx, 'POST', '/platform/auth/mfa/verify', {
        challengeToken: first.body.challengeToken,
        otp: '000000',
      });
      expect(bad.statusCode).toBe(401);
    }
    const afterLockout = await call(app, first.ctx, 'POST', '/platform/auth/mfa/verify', {
      challengeToken: first.body.challengeToken,
      otp: totpAt(secret, step + 1),
    });
    expect(afterLockout.statusCode).toBe(401);

    const second = await passwordStep(admin.email);
    const recovered = await call(app, second.ctx, 'POST', '/platform/auth/mfa/recovery', {
      challengeToken: second.body.challengeToken,
      recoveryCode: recoveryCodes[0],
    });
    expect(recovered.statusCode).toBe(200);
    const third = await passwordStep(admin.email);
    const reused = await call(app, third.ctx, 'POST', '/platform/auth/mfa/recovery', {
      challengeToken: third.body.challengeToken,
      recoveryCode: recoveryCodes[0],
    });
    expect(reused.statusCode).toBe(401);
  });

  it('P3-15: parallel wrong codes cannot go over the five-attempt limit', async () => {
    const admin = await fixture.createPlatformAdmin();
    const ctx0 = await fixture.loginPlatform(app, admin.email);
    const { secret, step } = await enrol(ctx0);

    const challenge = await passwordStep(admin.email);
    const guesses = await Promise.all(
      Array.from({ length: 8 }, () =>
        call(app, challenge.ctx, 'POST', '/platform/auth/mfa/verify', {
          challengeToken: challenge.body.challengeToken,
          otp: '000000',
        }),
      ),
    );
    expect(guesses.every((g) => g.statusCode === 401 || g.statusCode === 429)).toBe(true);
    const valid = await call(app, challenge.ctx, 'POST', '/platform/auth/mfa/verify', {
      challengeToken: challenge.body.challengeToken,
      otp: totpAt(secret, step + 1),
    });
    expect(valid.statusCode).toBe(401);
  });

  it('self-disable needs a current code; a peer reset is audited and ends the target’s sessions', async () => {
    const target = await fixture.createPlatformAdmin();
    const peer = await fixture.createPlatformAdmin();
    const targetCtx = await fixture.loginPlatform(app, target.email);
    const { secret, step } = await enrol(targetCtx);

    const wrong = await call(app, targetCtx, 'POST', '/platform/auth/mfa/disable', {
      otp: '123456',
    });
    expect(wrong.statusCode).toBe(401);

    const peerCtx = await fixture.loginPlatform(app, peer.email);
    const self = await call(app, peerCtx, 'POST', '/platform/auth/mfa/reset', {
      userId: peer.userId,
      reason: 'testing self reset',
    });
    expect(self.statusCode).toBe(400);
    const reset = await call(app, peerCtx, 'POST', '/platform/auth/mfa/reset', {
      userId: target.userId,
      reason: 'Lost phone — verified by video call.',
    });
    expect(reset.statusCode).toBe(200);
    expect((await call(app, targetCtx, 'GET', '/platform/auth/me')).statusCode).toBe(401);
    expect((await passwordStep(target.email)).body.status).toBe('ok');
    void secret;
    void step;

    // Platform-level audit rows: school_id NULL, written by atlas_app,
    // readable only through atlas_audit_reader.
    const reader = createPrismaClient(process.env.DATABASE_AUDIT_READER_URL);
    try {
      // Sign-in rows are keyed to the session; MFA rows to the user.
      const rows = await reader.auditEvent.findMany({
        where: {
          schoolId: null,
          OR: [{ entityId: target.userId }, { actorUserId: target.userId }],
        },
        orderBy: { occurredAt: 'asc' },
      });
      const actions = rows.map((r) => r.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'PLATFORM_SIGNED_IN',
          'PLATFORM_MFA_ENROLLED',
          'PLATFORM_MFA_RESET',
        ]),
      );
      expect(rows.find((r) => r.action === 'PLATFORM_MFA_RESET')?.actorUserId).toBe(peer.userId);
    } finally {
      await reader.$disconnect();
    }
    const visibleToApp = await prisma.auditEvent.findMany({
      where: { schoolId: null, entityId: target.userId },
    });
    expect(visibleToApp).toEqual([]);
  });
});

describe('Sign-in Security: recovery codes, sessions and alerts', () => {
  it('regenerating recovery codes needs a fresh code, replaces the old set and emails the admin', async () => {
    const channel = app.get<{ send: (m: { to: string; template: string }) => Promise<void> }>(
      NOTIFICATION_CHANNEL,
    );
    const send = vi.spyOn(channel, 'send');
    try {
      const admin = await fixture.createPlatformAdmin();
      const ctx = await fixture.loginPlatform(app, admin.email);
      const { secret, recoveryCodes: oldCodes, step } = await enrol(ctx);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: admin.email,
          template: PLATFORM_SECURITY_ALERT_TEMPLATE_NAME,
        }),
      );

      const wrong = await call(app, ctx, 'POST', '/platform/auth/mfa/recovery-codes', {
        otp: '000000',
      });
      expect(wrong.statusCode).toBe(401);
      // The code that confirmed enrolment is spent.
      const replay = await call(app, ctx, 'POST', '/platform/auth/mfa/recovery-codes', {
        otp: totpAt(secret, step),
      });
      expect(replay.statusCode).toBe(401);

      send.mockClear();
      const ok = await call(app, ctx, 'POST', '/platform/auth/mfa/recovery-codes', {
        otp: totpAt(secret, step + 1),
      });
      expect(ok.statusCode).toBe(200);
      const newCodes = ok.json<{ recoveryCodes: string[] }>().recoveryCodes;
      expect(newCodes).toHaveLength(10);
      expect(newCodes).not.toContain(oldCodes[0]);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: admin.email,
          template: PLATFORM_SECURITY_ALERT_TEMPLATE_NAME,
        }),
      );
      const status = await call(app, ctx, 'GET', '/platform/auth/mfa');
      expect(status.json<{ recoveryCodesRemaining: number }>().recoveryCodesRemaining).toBe(10);

      const oldTry = await passwordStep(admin.email);
      expect(
        (
          await call(app, oldTry.ctx, 'POST', '/platform/auth/mfa/recovery', {
            challengeToken: oldTry.body.challengeToken,
            recoveryCode: oldCodes[0],
          })
        ).statusCode,
      ).toBe(401);
      const newTry = await passwordStep(admin.email);
      expect(
        (
          await call(app, newTry.ctx, 'POST', '/platform/auth/mfa/recovery', {
            challengeToken: newTry.body.challengeToken,
            recoveryCode: newCodes[0],
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      send.mockRestore();
    }
  });

  it('lists only the admin’s own live sessions and signs out the others, audited', async () => {
    const admin = await fixture.createPlatformAdmin();
    const other = await fixture.createPlatformAdmin();
    const laptop = await fixture.loginPlatform(app, admin.email);
    const phone = await fixture.loginPlatform(app, admin.email);
    await fixture.loginPlatform(app, other.email);

    const listed = await call(app, laptop, 'GET', '/platform/auth/sessions');
    expect(listed.statusCode).toBe(200);
    const sessions = listed.json<{ sessions: { id: string; isCurrent: boolean }[] }>().sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(JSON.stringify(sessions)).not.toMatch(/token/iu);

    const out = await call(app, laptop, 'POST', '/platform/auth/sessions/sign-out-others');
    expect(out.statusCode).toBe(200);
    expect(out.json<{ signedOut: number }>().signedOut).toBe(1);
    expect((await call(app, phone, 'GET', '/platform/auth/me')).statusCode).toBe(401);
    expect((await call(app, laptop, 'GET', '/platform/auth/me')).statusCode).toBe(200);
    expect(
      (await call(app, laptop, 'GET', '/platform/auth/sessions')).json<{ sessions: unknown[] }>()
        .sessions,
    ).toHaveLength(1);

    const reader = createPrismaClient(process.env.DATABASE_AUDIT_READER_URL);
    try {
      const row = await reader.auditEvent.findFirst({
        where: {
          schoolId: null,
          entityId: admin.userId,
          action: 'PLATFORM_OTHER_SESSIONS_SIGNED_OUT',
        },
      });
      expect(row?.actorUserId).toBe(admin.userId);
    } finally {
      await reader.$disconnect();
    }
  });
});

describe('PLATFORM_MFA_REQUIRED enforcement', () => {
  // The flag is read from validated config once at boot (ConfigModule
  // caches it), so the gate is exercised by switching the live service's
  // reading of it — the guard path under test is exactly the production one.
  let restore: () => void;

  beforeAll(() => {
    const spy = vi.spyOn(app.get(PlatformMfaService), 'isRequired').mockReturnValue(true);
    restore = () => spy.mockRestore();
  });

  afterAll(() => restore());

  it('confines an unenrolled admin to the enrolment routes until a factor is confirmed', async () => {
    const admin = await fixture.createPlatformAdmin();
    const ctx = await fixture.loginPlatform(app, admin.email);
    const blocked = await call(app, ctx, 'GET', '/platform/schools');
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe('MFA_ENROLMENT_REQUIRED');
    expect((await call(app, ctx, 'GET', '/platform/auth/me')).statusCode).toBe(200);
    expect(
      (await call(app, ctx, 'GET', '/platform/auth/mfa')).json<{ required: boolean }>().required,
    ).toBe(true);

    const start = await call(app, ctx, 'POST', '/platform/auth/mfa/enrol');
    const { secret } = start.json<{ secret: string }>();
    await call(app, ctx, 'POST', '/platform/auth/mfa/enrol/confirm', {
      otp: totpAt(secret, timeStep()),
    });
    expect((await call(app, ctx, 'GET', '/platform/schools')).statusCode).toBe(200);
  });
});
