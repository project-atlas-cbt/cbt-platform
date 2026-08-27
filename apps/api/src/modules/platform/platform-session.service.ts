import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseCookie, stringifySetCookie } from 'cookie';
import { sign, unsign } from 'cookie-signature';
import { prisma } from '@atlas/db';
import type { Env } from '@atlas/config';

export const PLATFORM_SESSION_COOKIE_NAME = 'atlas_platform_session';

export interface AuthenticatedPlatformSession {
  sessionId: string;
  userId: string;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Software Admin's session issuance/rotation/revocation/cookie plumbing —
 * parallels identity/session.service.ts's SessionService closely, following
 * the *same convention* (same `cookie`/`cookie-signature` pair, same
 * sha256-of-bearer-token-at-rest approach), deliberately not the same
 * literal code: `PlatformSession` is a separate, tenant-independent table
 * (see its own schema doc comment), so every query here is a plain
 * `prisma.platformSession` call — no `withTenant`, there is no school to
 * scope by. Own cookie name (PLATFORM_SESSION_COOKIE_NAME) so a school
 * session and a platform session can never be confused for one another,
 * even if both cookies happened to be present on the same request.
 */
@Injectable()
export class PlatformSessionService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async issue(
    res: FastifyReply,
    params: { userId: string; rotatedFromId?: string; req?: FastifyRequest },
  ): Promise<AuthenticatedPlatformSession> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const ttlSeconds = this.config.get('SESSION_TTL_SECONDS', { infer: true });
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const userAgent = params.req?.headers['user-agent']?.toString().slice(0, 512);
    const ipAddress = params.req?.ip;

    const session = await prisma.platformSession.create({
      data: {
        userId: params.userId,
        tokenHash,
        expiresAt,
        ...(params.rotatedFromId !== undefined ? { rotatedFromId: params.rotatedFromId } : {}),
        ...(userAgent !== undefined ? { userAgent } : {}),
        ...(ipAddress !== undefined ? { ipAddress } : {}),
      },
    });

    this.setCookie(res, rawToken, expiresAt);
    return { sessionId: session.id, userId: session.userId };
  }

  /** Resolves the inbound request's platform session cookie against a live,
   * non-revoked, non-expired PlatformSession row. Returns null on any
   * failure — same "one generic outcome" shape as SessionService.resolve,
   * for the same enumeration-resistance reasoning. */
  async resolve(req: FastifyRequest): Promise<AuthenticatedPlatformSession | null> {
    const cookies = parseCookie(req.headers.cookie ?? '');
    const rawCookie = cookies[PLATFORM_SESSION_COOKIE_NAME];
    if (!rawCookie) return null;

    const signingSecret = this.config.get('SESSION_COOKIE_SECRET', { infer: true });
    const unsigned = unsign(rawCookie, signingSecret);
    if (typeof unsigned !== 'string') return null;

    const tokenHash = hashToken(unsigned);
    const session = await prisma.platformSession.findUnique({ where: { tokenHash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

    return { sessionId: session.id, userId: session.userId };
  }

  async revoke(sessionId: string): Promise<void> {
    await prisma.platformSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  clearCookie(res: FastifyReply): void {
    const cookieDomain = this.config.get('COOKIE_DOMAIN', { infer: true });
    res.header(
      'set-cookie',
      stringifySetCookie({
        name: PLATFORM_SESSION_COOKIE_NAME,
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
        name: PLATFORM_SESSION_COOKIE_NAME,
        value: sign(rawToken, signingSecret),
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        path: '/',
        expires: expiresAt,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      }),
    );
  }
}
