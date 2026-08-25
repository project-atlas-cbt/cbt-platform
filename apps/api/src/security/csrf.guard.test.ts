import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { parseCookie } from 'cookie';
import { unsign } from 'cookie-signature';
import { CsrfGuard } from './csrf.guard.js';
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
});
