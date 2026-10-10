import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { prisma } from '@atlas/db';
import { getProductName, type Env } from '@atlas/config';
import type { NotificationChannel } from '@atlas/notifications';
import { NOTIFICATION_CHANNEL } from '../../../notifications/notifications.module.js';
import { AppHttpException } from '../../../common/app-http-exception.js';
import { REDIS_CLIENT } from '../../../redis/redis.module.js';
import { AuditService } from '../../operations/audit-event.service.js';
import { PlatformSessionService } from '../platform-session.service.js';
import { openSecret, sealSecret } from './secret-box.js';
import { PLATFORM_SECURITY_ALERT_TEMPLATE_NAME } from '../admin-templates.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp.js';

/** B20 platform-level audit actions (school_id NULL rows). */
export const PLATFORM_MFA_AUDIT_ACTIONS = {
  enrolled: 'PLATFORM_MFA_ENROLLED',
  disabled: 'PLATFORM_MFA_DISABLED',
  reset: 'PLATFORM_MFA_RESET',
  recoveryCodeUsed: 'PLATFORM_MFA_RECOVERY_CODE_USED',
  recoveryCodesRegenerated: 'PLATFORM_MFA_RECOVERY_CODES_REGENERATED',
  otherSessionsSignedOut: 'PLATFORM_OTHER_SESSIONS_SIGNED_OUT',
  signedIn: 'PLATFORM_SIGNED_IN',
} as const;

const RECOVERY_CODE_COUNT = 10;
const CHALLENGE_TTL_SECONDS = 5 * 60;
const CHALLENGE_MAX_ATTEMPTS = 5;
const CHALLENGE_PREFIX = 'atlas:mfa:challenge:';
// Dev/test only — production refuses to boot without MFA_ENCRYPTION_KEY
// (env.schema.ts), so this never seals a real secret.
const DEV_FALLBACK_KEY = 'atlas-dev-only-mfa-key-not-for-production';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** 80-bit code, `xxxx-xxxx-xxxx-xxxx` from an unambiguous alphabet. */
function generateRecoveryCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i += 1) out += alphabet[bytes[i]! % alphabet.length];
  return out.match(/.{4}/gu)!.join('-');
}

const normaliseRecoveryCode = (code: string) => code.trim().toLowerCase().replace(/\s+/gu, '');

/** `2026-10-05 21:30 UTC` — platform-level events have no school timezone. */
const formatUtc = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const SECURITY_ALERT_CHANGES = {
  enrolled:
    'Two-step sign-in was turned on for your account, and your other sessions were signed out.',
  disabled: 'Two-step sign-in was turned off for your account.',
  reset:
    'Another Software Admin reset your two-step sign-in. All your sessions were signed out, and you will set it up again the next time you sign in.',
  recoveryCodesRegenerated:
    'New recovery codes were created for your account. Your old recovery codes no longer work.',
} as const;

/** Wrong-code attempts are counted under `<key>:attempts` (P3-15). */
interface ChallengeState {
  userId: string;
}

const invalidCode = () =>
  new AppHttpException({ code: 'UNAUTHENTICATED', message: 'Invalid or expired code.' });

/**
 * B20 Software Admin TOTP second factor (08 §16 "stronger controls" for
 * administrative operations; project-owner decision 2026-10-02).
 *
 * Login becomes two steps for an enrolled admin: password → a short-lived,
 * attempt-limited challenge token (no session yet) → TOTP or recovery code
 * → session. Every state change is audited as a platform-level event, and
 * enrolment/disable/reset end every other session the admin holds.
 */
@Injectable()
export class PlatformMfaService {
  private readonly logger = new Logger(PlatformMfaService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly audit: AuditService,
    private readonly sessions: PlatformSessionService,
    @Inject(NOTIFICATION_CHANNEL) private readonly notifications: NotificationChannel,
  ) {}

  /** Best-effort "was this you?" email: the change has already committed
   * and been audited, so a mail failure is logged, never thrown. */
  private async sendSecurityAlert(
    userId: string,
    change: keyof typeof SECURITY_ALERT_CHANGES,
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });
      if (!user?.email) return;
      await this.notifications.send({
        to: user.email,
        template: PLATFORM_SECURITY_ALERT_TEMPLATE_NAME,
        variables: {
          displayName: user.displayName,
          change: SECURITY_ALERT_CHANGES[change],
          occurredAt: formatUtc(new Date()),
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to send the platform security alert (${change}): ${String(error)}`);
    }
  }

  private key(): string {
    return this.config.get('MFA_ENCRYPTION_KEY', { infer: true }) ?? DEV_FALLBACK_KEY;
  }

  isRequired(): boolean {
    return this.config.get('PLATFORM_MFA_REQUIRED', { infer: true });
  }

  async isEnrolled(userId: string): Promise<boolean> {
    const credential = await prisma.platformMfaCredential.findUnique({
      where: { userId },
      select: { confirmedAt: true },
    });
    return Boolean(credential?.confirmedAt);
  }

  async status(userId: string): Promise<{
    enrolled: boolean;
    required: boolean;
    recoveryCodesRemaining: number;
  }> {
    const credential = await prisma.platformMfaCredential.findUnique({
      where: { userId },
      include: { recoveryCodes: { where: { usedAt: null }, select: { id: true } } },
    });
    const enrolled = Boolean(credential?.confirmedAt);
    return {
      enrolled,
      required: this.isRequired(),
      recoveryCodesRemaining: enrolled ? (credential?.recoveryCodes.length ?? 0) : 0,
    };
  }

  /** Starts (or restarts) enrolment: a fresh secret, not yet trusted for
   * login until confirmed with a first code. Refused while a confirmed
   * factor exists — replacing a factor goes through disable first, which
   * needs the current one. */
  async startEnrolment(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const existing = await prisma.platformMfaCredential.findUnique({ where: { userId } });
    if (existing?.confirmedAt) {
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'A second factor is already enrolled. Disable it before enrolling a new one.',
      });
    }
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const secret = generateTotpSecret();
    const sealed = sealSecret(secret, this.key());
    await prisma.platformMfaCredential.upsert({
      where: { userId },
      create: { userId, secretCiphertext: sealed },
      update: { secretCiphertext: sealed, lastUsedStep: null },
    });
    const issuer = getProductName({
      PRODUCT_NAME: this.config.get('PRODUCT_NAME', { infer: true }),
    });
    return { secret, otpauthUri: otpauthUri({ issuer, account: user.email ?? userId, secret }) };
  }

  /** Proves possession with a first code; returns the recovery codes — the
   * only time they are ever available in plaintext. */
  async confirmEnrolment(
    userId: string,
    otp: string,
    currentSessionId: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const credential = await prisma.platformMfaCredential.findUnique({ where: { userId } });
    if (!credential || credential.confirmedAt) {
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'There is no pending enrolment to confirm.',
      });
    }
    const step = verifyTotp(openSecret(credential.secretCiphertext, this.key()), otp);
    if (step === null) throw invalidCode();

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await prisma.$transaction([
      prisma.platformMfaCredential.update({
        where: { id: credential.id },
        data: { confirmedAt: new Date(), lastUsedStep: step },
      }),
      prisma.platformMfaRecoveryCode.deleteMany({ where: { credentialId: credential.id } }),
      prisma.platformMfaRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({
          credentialId: credential.id,
          codeHash: sha256(normaliseRecoveryCode(c)),
        })),
      }),
    ]);
    // Sessions opened before the factor existed were never second-factor
    // authenticated — they end; the one that just proved possession stays.
    const revoked = await this.sessions.revokeAllForUser(userId, currentSessionId);
    await this.audit.recordPlatform({
      actorUserId: userId,
      actorRole: 'SOFTWARE_ADMIN',
      action: PLATFORM_MFA_AUDIT_ACTIONS.enrolled,
      entityType: 'User',
      entityId: userId,
      metadata: { otherSessionsRevoked: revoked },
    });
    await this.sendSecurityAlert(userId, 'enrolled');
    return { recoveryCodes };
  }

  /** Replaces every recovery code (used or not) with a fresh set — needs a
   * current code, which it spends, so neither a hijacked session nor a
   * replayed code can mint new ones. Returned once, never retrievable. */
  async regenerateRecoveryCodes(userId: string, otp: string): Promise<{ recoveryCodes: string[] }> {
    const credential = await prisma.platformMfaCredential.findUnique({ where: { userId } });
    if (!credential?.confirmedAt) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'No second factor is enrolled.' });
    }
    const ok = await this.acceptTotp(
      credential.id,
      credential.secretCiphertext,
      credential.lastUsedStep,
      otp,
    );
    if (!ok) throw invalidCode();

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await prisma.$transaction([
      prisma.platformMfaRecoveryCode.deleteMany({ where: { credentialId: credential.id } }),
      prisma.platformMfaRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({
          credentialId: credential.id,
          codeHash: sha256(normaliseRecoveryCode(c)),
        })),
      }),
    ]);
    await this.audit.recordPlatform({
      actorUserId: userId,
      actorRole: 'SOFTWARE_ADMIN',
      action: PLATFORM_MFA_AUDIT_ACTIONS.recoveryCodesRegenerated,
      entityType: 'User',
      entityId: userId,
    });
    await this.sendSecurityAlert(userId, 'recoveryCodesRegenerated');
    return { recoveryCodes };
  }

  /** Self-service removal — requires a current code, so a hijacked session
   * alone can't strip the factor. */
  async disable(userId: string, otp: string, currentSessionId: string): Promise<void> {
    const credential = await prisma.platformMfaCredential.findUnique({ where: { userId } });
    if (!credential?.confirmedAt) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'No second factor is enrolled.' });
    }
    const step = verifyTotp(openSecret(credential.secretCiphertext, this.key()), otp, {
      notAfterStep: credential.lastUsedStep,
    });
    if (step === null) throw invalidCode();
    await prisma.platformMfaCredential.delete({ where: { id: credential.id } });
    const revoked = await this.sessions.revokeAllForUser(userId, currentSessionId);
    await this.audit.recordPlatform({
      actorUserId: userId,
      actorRole: 'SOFTWARE_ADMIN',
      action: PLATFORM_MFA_AUDIT_ACTIONS.disabled,
      entityType: 'User',
      entityId: userId,
      metadata: { otherSessionsRevoked: revoked },
    });
    await this.sendSecurityAlert(userId, 'disabled');
  }

  /** Another Software Admin clears a lost factor. Never for oneself (that's
   * `disable`, which needs the factor). The target's sessions all end. */
  async resetForAdmin(actorUserId: string, targetUserId: string, reason: string): Promise<void> {
    if (actorUserId === targetUserId) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Use the self-service disable flow for your own second factor.',
      });
    }
    if (!reason.trim()) {
      throw new AppHttpException({ code: 'VALIDATION_ERROR', message: 'A reason is required.' });
    }
    const target = await prisma.user.findFirst({
      where: { id: targetUserId, platformRoleAssignments: { some: { status: 'ACTIVE' } } },
      select: { id: true },
    });
    if (!target) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Software Admin not found.' });
    }
    const { count } = await prisma.platformMfaCredential.deleteMany({
      where: { userId: targetUserId },
    });
    const revoked = await this.sessions.revokeAllForUser(targetUserId);
    await this.audit.recordPlatform({
      actorUserId,
      actorRole: 'SOFTWARE_ADMIN',
      action: PLATFORM_MFA_AUDIT_ACTIONS.reset,
      entityType: 'User',
      entityId: targetUserId,
      reason,
      metadata: { credentialRemoved: count > 0, sessionsRevoked: revoked },
    });
    await this.sendSecurityAlert(targetUserId, 'reset');
  }

  // ---- login step 2 ------------------------------------------------------

  async createChallenge(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const state: ChallengeState = { userId };
    await this.redis.set(
      CHALLENGE_PREFIX + sha256(token),
      JSON.stringify(state),
      'EX',
      CHALLENGE_TTL_SECONDS,
    );
    return token;
  }

  /**
   * Resolves a challenge with a TOTP code or a recovery code. One generic
   * failure for every reason (unknown/expired challenge, wrong code,
   * replay, exhausted attempts); after CHALLENGE_MAX_ATTEMPTS wrong codes
   * the challenge is destroyed and the password step must be repeated.
   */
  async completeChallenge(
    challengeToken: string,
    proof: { otp: string } | { recoveryCode: string },
  ): Promise<string> {
    const key = CHALLENGE_PREFIX + sha256(challengeToken);
    const raw = await this.redis.get(key);
    if (!raw) throw invalidCode();
    const state = JSON.parse(raw) as ChallengeState;

    // P3-15: each guess reserves its attempt with an atomic INCR before the
    // code is checked, so parallel guesses can't all read "0 attempts" and
    // go over the limit.
    const attemptsKey = `${key}:attempts`;
    const attempt = await this.redis.incr(attemptsKey);
    if (attempt === 1) await this.redis.expire(attemptsKey, CHALLENGE_TTL_SECONDS);
    if (attempt > CHALLENGE_MAX_ATTEMPTS) {
      await this.redis.del(key, attemptsKey);
      throw invalidCode();
    }

    const credential = await prisma.platformMfaCredential.findUnique({
      where: { userId: state.userId },
    });
    if (!credential?.confirmedAt) {
      await this.redis.del(key, attemptsKey);
      throw invalidCode();
    }

    const ok =
      'otp' in proof
        ? await this.acceptTotp(
            credential.id,
            credential.secretCiphertext,
            credential.lastUsedStep,
            proof.otp,
          )
        : await this.acceptRecoveryCode(credential.id, state.userId, proof.recoveryCode);

    if (!ok) {
      if (attempt >= CHALLENGE_MAX_ATTEMPTS) await this.redis.del(key, attemptsKey);
      throw invalidCode();
    }
    await this.redis.del(key, attemptsKey);
    return state.userId;
  }

  private async acceptTotp(
    credentialId: string,
    sealed: string,
    lastUsedStep: number | null,
    otp: string,
  ): Promise<boolean> {
    const step = verifyTotp(openSecret(sealed, this.key()), otp, { notAfterStep: lastUsedStep });
    if (step === null) return false;
    // Conditional update: two concurrent submissions of the same code can't
    // both win — the second finds lastUsedStep already at `step`.
    const { count } = await prisma.platformMfaCredential.updateMany({
      where: {
        id: credentialId,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
      },
      data: { lastUsedStep: step },
    });
    return count === 1;
  }

  private async acceptRecoveryCode(
    credentialId: string,
    userId: string,
    code: string,
  ): Promise<boolean> {
    const hash = sha256(normaliseRecoveryCode(code));
    const candidate = await prisma.platformMfaRecoveryCode.findUnique({
      where: { codeHash: hash },
    });
    // Looked up by hash (an 80-bit random code) — no secret comparison here
    // for timing to leak.
    if (!candidate || candidate.credentialId !== credentialId || candidate.usedAt) return false;
    const { count } = await prisma.platformMfaRecoveryCode.updateMany({
      where: { id: candidate.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count !== 1) return false;
    await this.audit.recordPlatform({
      actorUserId: userId,
      actorRole: 'SOFTWARE_ADMIN',
      action: PLATFORM_MFA_AUDIT_ACTIONS.recoveryCodeUsed,
      entityType: 'User',
      entityId: userId,
    });
    return true;
  }
}
