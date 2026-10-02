import { createHash } from 'node:crypto';
import { SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import { parseCookie } from 'cookie';
import { unsign } from 'cookie-signature';
import type { FastifyRequest } from 'fastify';
import { SESSION_COOKIE_NAME } from '../modules/identity/session.service.js';
import { PLATFORM_SESSION_COOKIE_NAME } from '../modules/platform/platform-session.service.js';

/**
 * B20 (backend-roadmap B20 "rate limiting tuned per endpoint class —
 * authentication strictest, answer-save most permissive but still
 * bounded"; DoD 8 "without throttling legitimate exam traffic").
 *
 * The constraint that shapes everything here is R-09: a school lab puts ~40
 * students behind ONE NAT address. Any limit keyed by IP for an
 * authenticated route would make the whole lab share one bucket, so:
 *
 * - authenticated traffic is keyed by the **session** (a validly-signed
 *   session cookie — a forged/garbage cookie can't mint fresh buckets, it
 *   falls back to the IP key);
 * - sign-in is keyed by **IP + account** (bounds guessing against one
 *   account without stopping 40 different students signing in from the
 *   same address), plus a looser **per-IP** ceiling against credential
 *   stuffing across many accounts.
 *
 * Classes are declared per route with `@RateLimitClass(...)`; a route with
 * no class gets the `default` throttler only.
 */
export type RateLimitClassName = 'auth' | 'answer' | 'heavy';

export const RATE_LIMIT_CLASS_KEY = 'atlas:rateLimitClass';

export const RateLimitClass = (cls: RateLimitClassName) => SetMetadata(RATE_LIMIT_CLASS_KEY, cls);

export function rateLimitClassOf(context: ExecutionContext): RateLimitClassName | undefined {
  const fromHandler = Reflect.getMetadata(RATE_LIMIT_CLASS_KEY, context.getHandler()) as
    RateLimitClassName | undefined;
  return (
    fromHandler ??
    (Reflect.getMetadata(RATE_LIMIT_CLASS_KEY, context.getClass()) as
      RateLimitClassName | undefined)
  );
}

const shortHash = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 32);

export function ipTracker(req: Record<string, unknown>): string {
  return `ip:${String((req as unknown as FastifyRequest).ip ?? 'unknown')}`;
}

/** Session-keyed when the request carries a session cookie with a valid
 * signature; IP-keyed otherwise. */
export function principalTracker(signingSecret: string) {
  return (req: Record<string, unknown>): string => {
    const cookies = parseCookie((req as unknown as FastifyRequest).headers?.cookie ?? '');
    for (const name of [SESSION_COOKIE_NAME, PLATFORM_SESSION_COOKIE_NAME]) {
      const raw = cookies[name];
      if (!raw) continue;
      const token = unsign(raw, signingSecret);
      if (typeof token === 'string') return `session:${shortHash(token)}`;
    }
    return ipTracker(req);
  };
}

/** IP + the account being targeted (school identifier, platform email, or
 * an MFA challenge) — hashed, so the tracker key never stores the
 * identifier itself. */
export function authAccountTracker(req: Record<string, unknown>): string {
  const body = ((req as unknown as FastifyRequest).body ?? {}) as Record<string, unknown>;
  const account = [body.identifier, body.email, body.loginIdentifier, body.challengeToken].find(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  return `${ipTracker(req)}:acct:${shortHash((account ?? '').toLowerCase())}`;
}

export interface RateLimitConfig {
  defaultMax: number;
  defaultWindowSeconds: number;
  answerMax: number;
  heavyMax: number;
  authIdentifierMax: number;
  authIpMax: number;
  signingSecret: string;
}

const MINUTE = 60_000;

export function buildThrottlers(cfg: RateLimitConfig): ThrottlerOptions[] {
  const principal = principalTracker(cfg.signingSecret);
  const only = (cls: RateLimitClassName) => (ctx: ExecutionContext) =>
    rateLimitClassOf(ctx) !== cls;
  return [
    {
      // Every route except sign-in and the answer path, which have their
      // own, purpose-sized limits below.
      name: 'default',
      limit: cfg.defaultMax,
      ttl: cfg.defaultWindowSeconds * 1000,
      getTracker: principal,
      skipIf: (ctx) => {
        const cls = rateLimitClassOf(ctx);
        return cls === 'auth' || cls === 'answer';
      },
    },
    {
      name: 'auth',
      limit: cfg.authIdentifierMax,
      ttl: MINUTE,
      getTracker: authAccountTracker,
      skipIf: only('auth'),
    },
    {
      name: 'authIp',
      limit: cfg.authIpMax,
      ttl: MINUTE,
      getTracker: ipTracker,
      skipIf: only('auth'),
    },
    {
      name: 'answer',
      limit: cfg.answerMax,
      ttl: MINUTE,
      getTracker: principal,
      skipIf: only('answer'),
    },
    {
      name: 'heavy',
      limit: cfg.heavyMax,
      ttl: MINUTE,
      getTracker: principal,
      skipIf: only('heavy'),
    },
  ];
}
