/**
 * ADR-0022: proves CsrfGuard works end to end over real HTTP — in
 * particular, that an AppHttpException thrown from a Guard reaches
 * HttpExceptionFilter with the real Fastify-decorated request/reply and
 * comes back as the ADR-0033 envelope, not a raw crash or a hung request.
 * An earlier NestMiddleware-based version of this failed exactly that way
 * (`Cannot read properties of undefined (reading 'correlationId')` plus a
 * request that never completed) — see CsrfGuard's own doc comment.
 *
 * Boots a throwaway probe module rather than the real AppModule — B0 has
 * no mutating endpoint yet to exercise a POST against.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, Get, Module, Post } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { unsign } from 'cookie-signature';
import type { ErrorEnvelope } from '@atlas/validation';
import { AppConfigModule } from '../config/app-config.module.js';
import { HttpExceptionFilter } from '../common/http-exception.filter.js';
import { TenancyContextService } from '../common/tenancy-context.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { createCsrfToken } from './csrf.js';

@Controller()
class CsrfProbeController {
  @Get('csrf-probe')
  get() {
    return { ok: true };
  }

  @Post('csrf-probe')
  post() {
    return { ok: true };
  }
}

@Module({
  imports: [AppConfigModule],
  controllers: [CsrfProbeController],
  providers: [TenancyContextService, { provide: APP_GUARD, useClass: CsrfGuard }],
})
class CsrfProbeModule {}

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(CsrfProbeModule, new FastifyAdapter(), {
    logger: false,
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

function extractSignedSecret(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  const value = parseCookie(header?.split(';')[0] ?? '')._csrf;
  if (!value) throw new Error('response carried no _csrf cookie');
  return value;
}

describe('CSRF protection end-to-end (ADR-0022)', () => {
  it('a GET request sets a fresh signed secret cookie and requires no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/csrf-probe' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('a POST with no CSRF token is rejected as a proper ADR-0033 envelope, not a raw crash', async () => {
    const res = await app.inject({ method: 'POST', url: '/csrf-probe' });
    expect(res.statusCode).toBe(403);
    const body = res.json<ErrorEnvelope>();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.retryable).toBe(false);
    expect(body.error.correlationId).toBeDefined();
  });

  it('a POST with a matching cookie and token succeeds', async () => {
    const getRes = await app.inject({ method: 'GET', url: '/csrf-probe' });
    const signedSecret = extractSignedSecret(getRes.headers['set-cookie']);
    const secret = unsign(signedSecret, process.env.SESSION_COOKIE_SECRET ?? '');
    if (secret === false)
      throw new Error('test setup failed to unsign the cookie it just received');

    const token = createCsrfToken(secret, 'platform');
    const postRes = await app.inject({
      method: 'POST',
      url: '/csrf-probe',
      headers: { cookie: `_csrf=${signedSecret}`, 'x-csrf-token': token },
    });
    // Nest defaults a POST handler's success status to 201, not 200 —
    // CsrfProbeController.post() never overrides it, so 201 is correct.
    expect(postRes.statusCode).toBe(201);
  });

  it('a POST with a stale/tampered cookie value is rejected, not silently trusted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/csrf-probe',
      headers: { cookie: '_csrf=not-a-real-signed-value', 'x-csrf-token': 'anything' },
    });
    expect(res.statusCode).toBe(403);
  });
});
