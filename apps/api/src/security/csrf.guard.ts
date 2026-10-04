import {
  Injectable,
  Optional,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseCookie, stringifySetCookie } from 'cookie';
import { sign, unsign } from 'cookie-signature';
import type { Env } from '@atlas/config';
import { AppHttpException } from '../common/app-http-exception.js';
import { TenancyContextService } from '../common/tenancy-context.service.js';
import {
  CSRF_COOKIE_NAME,
  CSRF_TOKEN_HEADER,
  PLATFORM_CSRF_USER_INFO,
  generateCsrfSecret,
  verifyCsrfToken,
} from './csrf.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Set by CsrfGuard on every request. A later handler that needs to
     * hand the client a fresh token (e.g. B1's login flow) reads this and
     * calls createCsrfToken(secret, userInfo) itself — see csrf.ts.
     */
    csrfSecret?: string;
  }
}

/**
 * ADR-0022: "cookie and CORS configuration, CSRF middleware, domain plan"
 * — the CSRF half. Double-submit pattern: a signed, HttpOnly secret cookie
 * (never readable by JS) plus a per-request token the client must echo
 * back in a header on mutating requests. GET/HEAD/OPTIONS never require
 * one — CSRF only matters for requests that change state.
 *
 * **A Guard, not NestMiddleware, and deliberately so.** An earlier version
 * of this was NestMiddleware, which under `@nestjs/platform-fastify` only
 * ever receives the raw Node `http.IncomingMessage`/`ServerResponse` (see
 * TenancyMiddleware's comment on the same point) — but more importantly,
 * an exception *thrown* from within middleware reaches HttpExceptionFilter
 * with that same raw pair standing in for FastifyRequest/FastifyReply,
 * where `req.raw` and `res.status()` don't exist. That's not a hypothetical:
 * it was caught by csrf.integration.test.ts failing with `Cannot read
 * properties of undefined (reading 'correlationId')` and a request that
 * timed out instead of ever completing. Guards run inside Nest's real
 * request-handling pipeline (after routing, before the handler) and
 * receive the fully Fastify-decorated request/reply — exceptions thrown
 * here reach the exception filter exactly like a controller-thrown one.
 *
 * Bound globally via APP_GUARD (security.module.ts), so it runs on every
 * matched route in registration order relative to ThrottlerGuard.
 * TenancyMiddleware still runs first regardless — middleware always
 * precedes guards in Nest's pipeline — so `this.tenancy.schoolId` is
 * already resolved by the time this guard reads it for the userInfo
 * binding (see csrf.ts's comment on why that binding matters).
 *
 * Session issuance itself is B1's job; this guard doesn't know or care
 * whether a caller is authenticated. It runs on every request so the
 * secret cookie (and therefore a fetchable token) already exists by the
 * time B1 needs to hand one to a login form.
 */
/** Marks the one kind of route that hands the client a CSRF token
 * (`GET /tenant/resolve`). Only such a route persists a newly minted secret
 * cookie — see the race note in `canActivate`. */
export const ISSUES_CSRF_TOKEN = 'atlas:issuesCsrfToken';
export const IssuesCsrfToken = () => SetMetadata(ISSUES_CSRF_TOKEN, true);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly tenancy: TenancyContextService,
    private readonly config: ConfigService<Env, true>,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const res = context.switchToHttp().getResponse<FastifyReply>();

    // B20: its own key (CSRF_SECRET), so session and CSRF signing rotate
    // independently; production requires it (env.schema.ts), elsewhere it
    // falls back to the session secret.
    const csrfSecret: string | undefined = this.config.get('CSRF_SECRET', { infer: true });
    const sessionSecret: string = this.config.get('SESSION_COOKIE_SECRET', { infer: true });
    const signingSecret = csrfSecret ?? sessionSecret;
    const cookies = parseCookie(req.headers.cookie ?? '');
    const rawCookie = cookies[CSRF_COOKIE_NAME];
    const unsigned = rawCookie ? unsign(rawCookie, signingSecret) : false;

    // F20 fix — a first-visit race found by the browser suites: a page with
    // no cookie yet sends `GET /tenant/resolve` (which returns a token) and
    // other GETs (`/auth/me`) at the same time. When every cookie-less
    // request minted and set its own secret, whichever response landed last
    // won the cookie — and if that was `/auth/me`, the token the page held
    // no longer matched, so the student's first sign-in on a fresh lab
    // browser failed with "Missing or invalid CSRF token". Only a
    // token-issuing route now persists a new secret. (Without a Reflector —
    // unit tests — every route keeps the original mint-and-set behaviour.)
    const issuesToken = this.reflector
      ? this.reflector.getAllAndOverride<boolean>(ISSUES_CSRF_TOKEN, [
          context.getHandler(),
          context.getClass(),
        ]) === true
      : true;
    const secret = typeof unsigned === 'string' ? unsigned : generateCsrfSecret();
    if (typeof unsigned !== 'string' && issuesToken) {
      // No valid signed cookie yet (first visit, or tampered/tossed value
      // that failed the signature check) — mint one and set it now, so a
      // fresh cookie always exists before we might need to verify against
      // it on a later request.
      const isProduction = this.config.get('NODE_ENV', { infer: true }) === 'production';
      res.header(
        'set-cookie',
        stringifySetCookie({
          name: CSRF_COOKIE_NAME,
          value: sign(secret, signingSecret),
          httpOnly: true,
          sameSite: 'lax',
          secure: isProduction,
          path: '/',
        }),
      );
    }
    req.csrfSecret = secret;

    if (MUTATING_METHODS.has(req.method)) {
      const userInfo = this.tenancy.schoolId ?? PLATFORM_CSRF_USER_INFO;
      const header = req.headers[CSRF_TOKEN_HEADER];
      const token = Array.isArray(header) ? header[0] : header;
      if (!token || !verifyCsrfToken(secret, token, userInfo)) {
        throw new AppHttpException({
          code: 'FORBIDDEN',
          message: 'Missing or invalid CSRF token.',
        });
      }
    }

    return true;
  }
}
