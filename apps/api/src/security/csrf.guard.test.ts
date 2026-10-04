import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { parseCookie } from 'cookie';
import { unsign } from 'cookie-signature';
import { Reflector } from '@nestjs/core';
import { CsrfGuard, ISSUES_CSRF_TOKEN } from './csrf.guard.js';
import { TenancyContextService } from '../common/tenancy-context.service.js';
import { AppHttpException } from '../common/app-http-exception.js';
import { createCsrfToken } from './csrf.js';

const SIGNING_SECRET = 'test-signing-secret-32-characters';

function makeConfig(overrides: Partial<Record<'NODE_ENV' | 'SESSION_COOKIE_SECRET', string>> = {}) {
  const values: Record<string, string> = {
    SESSION_COOKIE_SECRET: SIGNING_SECRET,
    NODE_ENV: 'test',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConstructorParameters<
    typeof CsrfGuard
  >[1];
}

function makeContext(opts: { method: string; cookie?: string; token?: string }) {
  const headers: Record<string, string> = {};
  const req = {
    method: opts.method,
    headers: {
      cookie: opts.cookie,
      'x-csrf-token': opts.token,
    },
    csrfSecret: undefined as string | undefined,
  };
  const res = {
    header: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { context, req, res, headers };
}

describe('CsrfGuard (ADR-0022)', () => {
  it('mints and sets a signed secret cookie on a GET request with none yet, and allows it', () => {
    const guard = new CsrfGuard(new TenancyContextService(), makeConfig());
    const { context, res, headers } = makeContext({ method: 'GET' });

    expect(guard.canActivate(context)).toBe(true);
    expect(res.header).toHaveBeenCalledWith('set-cookie', expect.stringContaining('_csrf='));
    const raw = parseCookie(headers['set-cookie']?.split(';')[0] ?? '')._csrf;
    expect(typeof unsign(raw ?? '', SIGNING_SECRET)).toBe('string');
  });

  it('records the resolved secret onto the request for later handlers', () => {
    const guard = new CsrfGuard(new TenancyContextService(), makeConfig());
    const { context, req } = makeContext({ method: 'GET' });

    guard.canActivate(context);
    expect(req.csrfSecret).toBeTruthy();
  });

  it('rejects a POST with no CSRF token at all', () => {
    const guard = new CsrfGuard(new TenancyContextService(), makeConfig());
    const { context } = makeContext({ method: 'POST' });

    expect(() => guard.canActivate(context)).toThrow(AppHttpException);
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('accepts a POST whose token matches the cookie secret and tenant context', () => {
    const tenancy = new TenancyContextService();
    const guard = new CsrfGuard(tenancy, makeConfig());

    const first = makeContext({ method: 'GET' });
    guard.canActivate(first.context);
    const signedCookie = parseCookie(first.headers['set-cookie']?.split(';')[0] ?? '')._csrf ?? '';
    const secret = unsign(signedCookie, SIGNING_SECRET);
    if (secret === false) throw new Error('test setup failed to sign a secret');

    const token = tenancy.run({ schoolId: null, subdomain: null }, () =>
      createCsrfToken(secret, 'platform'),
    );

    tenancy.run({ schoolId: null, subdomain: null }, () => {
      const second = makeContext({ method: 'POST', cookie: `_csrf=${signedCookie}`, token });
      expect(guard.canActivate(second.context)).toBe(true);
    });
  });

  it('rejects a token minted for a different tenant (cookie-tossing mitigation)', () => {
    const tenancy = new TenancyContextService();
    const guard = new CsrfGuard(tenancy, makeConfig());

    const first = makeContext({ method: 'GET' });
    guard.canActivate(first.context);
    const signedCookie = parseCookie(first.headers['set-cookie']?.split(';')[0] ?? '')._csrf ?? '';
    const secret = unsign(signedCookie, SIGNING_SECRET);
    if (secret === false) throw new Error('test setup failed to sign a secret');

    const tokenForSchoolA = createCsrfToken(secret, 'school-a-id');

    tenancy.run({ schoolId: 'school-b-id', subdomain: 'school-b' }, () => {
      const second = makeContext({
        method: 'POST',
        cookie: `_csrf=${signedCookie}`,
        token: tokenForSchoolA,
      });
      expect(() => guard.canActivate(second.context)).toThrow(AppHttpException);
    });
  });

  it('F20: with route metadata, only a token-issuing route persists a newly minted secret', () => {
    const reflector = new Reflector();
    const issuing = () => undefined;
    Reflect.defineMetadata(ISSUES_CSRF_TOKEN, true, issuing);
    const plain = () => undefined;
    const guard = new CsrfGuard(new TenancyContextService(), makeConfig(), reflector);

    const resolve = makeContext({ method: 'GET' });
    Object.assign(resolve.context, { getHandler: () => issuing, getClass: () => class {} });
    guard.canActivate(resolve.context);
    expect(resolve.res.header).toHaveBeenCalledWith(
      'set-cookie',
      expect.stringContaining('_csrf='),
    );

    // The concurrent first-visit GET (e.g. /auth/me) must not overwrite it.
    const me = makeContext({ method: 'GET' });
    Object.assign(me.context, { getHandler: () => plain, getClass: () => class {} });
    expect(guard.canActivate(me.context)).toBe(true);
    expect(me.res.header).not.toHaveBeenCalled();
  });

  it('F20: the token from /tenant/resolve still verifies after a racing cookie-less GET', () => {
    const tenancy = new TenancyContextService();
    const reflector = new Reflector();
    const issuing = () => undefined;
    Reflect.defineMetadata(ISSUES_CSRF_TOKEN, true, issuing);
    const guard = new CsrfGuard(tenancy, makeConfig(), reflector);

    const resolve = makeContext({ method: 'GET' });
    Object.assign(resolve.context, { getHandler: () => issuing, getClass: () => class {} });
    guard.canActivate(resolve.context);
    const cookie = resolve.headers['set-cookie']!.split(';')[0]!;
    const token = createCsrfToken(resolve.req.csrfSecret!, 'platform');

    const racing = makeContext({ method: 'GET' });
    Object.assign(racing.context, { getHandler: () => () => undefined, getClass: () => class {} });
    guard.canActivate(racing.context); // sets nothing

    const login = makeContext({ method: 'POST', cookie, token });
    Object.assign(login.context, { getHandler: () => () => undefined, getClass: () => class {} });
    expect(guard.canActivate(login.context)).toBe(true);
  });
});
