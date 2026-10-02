import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseCookie, stringifySetCookie } from 'cookie';
import { sign, unsign } from 'cookie-signature';
import { prisma, withTenant } from '@atlas/db';
import type { Env } from '@atlas/config';

export const SESSION_COOKIE_NAME = 'atlas_session';

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  schoolId: string;
}

function hashToken(rawToken: string): string {
  // Sessions are high-entropy random tokens, not low-entropy passwords —
  // sha256 (fast, deterministic) is the right primitive for a lookup key,
  // unlike PasswordService's deliberately-slow Argon2id.
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Session issuance, rotation, revocation, and cookie plumbing (ADR-0022).
 * Reuses main.ts/csrf.guard.ts's existing `cookie` + `cookie-signature` pair
 * — one signing convention in the codebase, not a second one introduced
 * here. DB stores only sha256(rawToken); the raw bearer value exists only
 * in the signed cookie, never at rest.
 */
@Injectable()
export class SessionService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Creates a new session row and sets its cookie on `res`. */
  async issue(
    res: FastifyReply,
    params: { userId: string; schoolId: string; rotatedFromId?: string; req?: FastifyRequest },
  ): Promise<AuthenticatedSession> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const ttlSeconds = this.config.get('SESSION_TTL_SECONDS', { infer: true });
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const userAgent = params.req?.headers['user-agent']?.toString().slice(0, 512);
    const ipAddress = params.req?.ip;

    // exactOptionalPropertyTypes: Prisma's generated input type treats an
    // absent optional field differently from one explicitly set to
    // `undefined` — spread conditionally rather than assign `undefined`
    // directly (same pattern as app-http-exception.ts's `details`).
    const session = await withTenant(prisma, params.schoolId, (tx) =>
      tx.session.create({
        data: {
          schoolId: params.schoolId,
          userId: params.userId,
          tokenHash,
          expiresAt,
          ...(params.rotatedFromId !== undefined ? { rotatedFromId: params.rotatedFromId } : {}),
          ...(userAgent !== undefined ? { userAgent } : {}),
          ...(ipAddress !== undefined ? { ipAddress } : {}),
        },
      }),
    );

    this.setCookie(res, rawToken, expiresAt);
    return { sessionId: session.id, userId: session.userId, schoolId: session.schoolId };
  }

  /**
   * Resolves the inbound request's session cookie against a live,
   * non-revoked, non-expired Session row within `schoolId`'s tenant scope.
   * Returns null on any failure (missing cookie, bad signature, no
   * matching/valid row) — callers decide what "no session" means for their
   * route (AuthGuard throws; POST /auth/refresh treats it as already-logged-out).
   */
  async resolve(req: FastifyRequest, schoolId: string): Promise<AuthenticatedSession | null> {
    const cookies = parseCookie(req.headers.cookie ?? '');
    const rawCookie = cookies[SESSION_COOKIE_NAME];
    if (!rawCookie) return null;

    const signingSecret = this.config.get('SESSION_COOKIE_SECRET', { infer: true });
    const unsigned = unsign(rawCookie, signingSecret);
    if (typeof unsigned !== 'string') return null;

    const tokenHash = hashToken(unsigned);
    const session = await withTenant(prisma, schoolId, (tx) =>
      tx.session.findUnique({ where: { tokenHash } }),
    );
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

    return { sessionId: session.id, userId: session.userId, schoolId: session.schoolId };
  }

  /** Revokes a session by id (logout, or the old half of a refresh rotation). */
  async revoke(schoolId: string, sessionId: string): Promise<void> {
    await withTenant(prisma, schoolId, (tx) =>
      tx.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }),
    );
  }

  /**
   * B20 (08 §16 "secure, revocable sessions"): revokes every live session a
   * user holds at this school — after a password change, reset, or an
   * administrator-forced reset, a stolen session must not outlive the
   * credential it was issued against. `exceptSessionId` keeps the caller's
   * own session (a user changing their password stays signed in on the
   * device they did it from). Returns how many sessions were revoked.
   */
  async revokeAllForUser(
    schoolId: string,
    userId: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.session.updateMany({
        where: {
          schoolId,
          userId,
          revokedAt: null,
          ...(exceptSessionId !== undefined && { id: { not: exceptSessionId } }),
        },
        data: { revokedAt: new Date() },
      }),
    );
    return count;
  }

  clearCookie(res: FastifyReply): void {
    // Must carry the same Domain the cookie was originally set with, or the
    // browser treats this as an unrelated cookie and the real one survives.
    const cookieDomain = this.config.get('COOKIE_DOMAIN', { infer: true });
    res.header(
      'set-cookie',
      stringifySetCookie({
        name: SESSION_COOKIE_NAME,
        value: '',
        maxAge: 0,
        path: '/',
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      }),
    );
  }

  private setCookie(res: FastifyReply, rawToken: string, expiresAt: Date): void {
    const signingSecret = this.config.get('SESSION_COOKIE_SECRET', { infer: true });
    const isProduction = this.config.get('NODE_ENV', { infer: true }) === 'production';
    const cookieDomain = this.config.get('COOKIE_DOMAIN', { infer: true });

    res.header(
      'set-cookie',
      stringifySetCookie({
        name: SESSION_COOKIE_NAME,
        value: sign(rawToken, signingSecret),
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        path: '/',
        expires: expiresAt,
        // Empty/unset locally (host-only cookie) — see docs/operations/domain-plan.md.
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      }),
    );
  }
}
