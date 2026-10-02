/**
 * B20 DoD 6: "Logs carry correlation ids and tenant context, and contain no
 * credentials, answer content, or unnecessary PII."
 *
 * The app is booted with the production logger (PinoNestLogger over
 * @atlas/observability's redacting pino) writing into memory. Flows that
 * handle every class of secret run through it — passwords (right, wrong,
 * changed), reset tokens, emails, TOTP codes, recovery codes, session and
 * CSRF tokens, answer content — then the captured log is searched for each
 * value. (The dev console *email transport* is not a log: it withholds
 * content in production, unit-tested in @atlas/notifications.)
 */
import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createLogger } from '@atlas/observability';
import { AppModule } from '../../app.module.js';
import { PinoNestLogger } from '../../common/logging/pino-nest-logger.js';
import { registerHttpSecurity } from '../http-security.js';
import { timeStep, totpAt } from '../../modules/platform/mfa/totp.js';
import {
  ADMIN_HOST,
  call,
  csrfContext,
  ROOT_DOMAIN,
  SecurityFixture,
  type FixtureSchool,
} from '../../test-support/security-fixture.js';

const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const lines: string[] = [];
const sink = new Writable({
  write(chunk: Buffer, _enc, cb) {
    lines.push(...chunk.toString().split('\n').filter(Boolean));
    cb();
  },
});

let app: NestFastifyApplication;
const fixture = new SecurityFixture();
let school: FixtureSchool;
const secrets: string[] = [];

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: new PinoNestLogger(createLogger({ service: 'api', level: 'debug', destination: sink })),
  });
  await registerHttpSecurity(app, {
    isProduction: false,
    webOrigin: 'http://localhost:3000',
    rootDomain: ROOT_DOMAIN,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  school = await fixture.createSchool('logs');
  await fixture.populate(school);
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
  consoleLog.mockRestore();
});

describe('log hygiene (DoD 6)', () => {
  it('no credential, token, code, email or answer content reaches the structured log', async () => {
    // Sign-in, failed sign-ins through to lockout, an authorization denial.
    const admin = await fixture.loginAs(app, school, 'SCHOOL_ADMIN');
    secrets.push(admin.sessionCookie!, admin.csrfToken, 'security-suite-password-123');
    const anon = await csrfContext(app, school.host);
    for (let i = 0; i < 6; i += 1) {
      await call(app, anon, 'POST', '/auth/login', {
        identifier: school.users.TEACHER.identifier,
        password: 'Wr0ng-but-secret-Passw0rd',
      });
    }
    secrets.push('Wr0ng-but-secret-Passw0rd', school.users.TEACHER.identifier);
    const student = await fixture.loginAs(app, school, 'STUDENT');
    await call(app, student, 'GET', '/teachers'); // denied → logged, with ids only

    // Password reset (an email address and a live token in flight).
    consoleLog.mockClear();
    await call(app, anon, 'POST', '/auth/password/reset/request', {
      identifier: school.users.MODERATOR.identifier,
    });
    const resetToken = /token=([A-Za-z0-9_-]+)/u.exec(
      consoleLog.mock.calls.map((c) => String(c[0])).join('\n'),
    )?.[1];
    expect(resetToken).toBeDefined();
    secrets.push(resetToken!, `${school.users.MODERATOR.identifier}@example.test`);
    await call(app, anon, 'POST', '/auth/password/reset/confirm', {
      token: resetToken,
      newPassword: 'N3w-Secret-Reset-Passw0rd',
    });
    secrets.push('N3w-Secret-Reset-Passw0rd');

    // Answer content on the attempt path (the save is refused, which is
    // exactly the path that logs most).
    const answerMarker = 'ANSWER-CONTENT-7f3a91';
    await call(
      app,
      student,
      'PUT',
      `/attempts/${'0'.repeat(8)}-0000-7000-8000-000000000000/answers/x`,
      {
        selectedOptionId: answerMarker,
        sequenceNumber: 1,
      },
    );
    secrets.push(answerMarker);

    // Software Admin MFA: TOTP secret, codes, recovery codes.
    const sa = await fixture.createPlatformAdmin();
    secrets.push(sa.email);
    const platform = await fixture.loginPlatform(app, sa.email);
    const start = await call(app, platform, 'POST', '/platform/auth/mfa/enrol');
    const { secret } = start.json<{ secret: string }>();
    const otp = totpAt(secret, timeStep());
    const confirm = await call(app, platform, 'POST', '/platform/auth/mfa/enrol/confirm', { otp });
    const { recoveryCodes } = confirm.json<{ recoveryCodes: string[] }>();
    secrets.push(secret, ...recoveryCodes);
    const step1 = await call(
      app,
      await csrfContext(app, ADMIN_HOST),
      'POST',
      '/platform/auth/login',
      {
        email: sa.email,
        password: 'security-suite-password-123',
      },
    );
    secrets.push(step1.json<{ challengeToken: string }>().challengeToken);

    const log = lines.join('\n');
    expect(lines.length).toBeGreaterThan(5);
    for (const value of secrets) {
      expect(log.includes(value), `log contains a secret value (${value.slice(0, 6)}…)`).toBe(
        false,
      );
    }
  });

  it('request-path log lines carry the correlation id and the tenant', () => {
    const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    const inRequest = parsed.filter((l) => typeof l.correlationId === 'string');
    expect(inRequest.length).toBeGreaterThan(0);
    expect(inRequest.some((l) => l.schoolId === school.schoolId)).toBe(true);
    for (const l of parsed) {
      expect(l.service).toBe('api');
      expect(typeof l.level).toBe('string');
    }
  });
});
