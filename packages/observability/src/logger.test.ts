import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';
import { runWithLogContext } from './log-context.js';
import { scrubText, scrubValue } from './redaction.js';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      for (const l of chunk.toString().split('\n').filter(Boolean)) {
        lines.push(JSON.parse(l) as Record<string, unknown>);
      }
      cb();
    },
  });
  return { lines, logger: createLogger({ service: 'test', destination: stream }) };
}

describe('scrubText', () => {
  it('masks emails, token query params, bearer tokens and session cookies', () => {
    const out = scrubText(
      'to=ada@example.com url=http://x/reset?token=abc123&foo=1 Authorization: Bearer eyJabc.def ' +
        'cookie atlas_session=s%3Aabc.sig; _csrf=zzz',
    );
    expect(out).not.toContain('ada@example.com');
    expect(out).not.toContain('abc123');
    expect(out).toContain('foo=1');
    expect(out).not.toContain('eyJabc');
    expect(out).not.toContain('s%3Aabc');
    expect(out).not.toContain('zzz');
  });

  it('is idempotent', () => {
    const once = scrubText('a@b.co ?token=x');
    expect(scrubText(once)).toBe(once);
  });
});

describe('scrubValue', () => {
  it('redacts sensitive keys at any depth and scrubs strings', () => {
    const out = scrubValue({
      userId: 'u1',
      password: 'hunter2',
      nested: { email: 'x@y.zz', answers: [{ selectedOptionIds: ['o1'] }], note: 'mail z@q.io' },
    }) as Record<string, unknown>;
    expect(out.userId).toBe('u1');
    expect(out.password).toBe('[redacted]');
    const nested = out.nested as Record<string, unknown>;
    expect(nested.email).toBe('[redacted]');
    expect(nested.answers).toBe('[redacted]');
    expect(nested.note).toBe('mail [redacted]');
  });
});

describe('createLogger', () => {
  it('emits JSON with service, level and the async log context', () => {
    const { lines, logger } = capture();
    runWithLogContext({ correlationId: 'c-1', schoolId: 's-1' }, () => logger.info('hello'));
    expect(lines[0]).toMatchObject({
      service: 'test',
      level: 'info',
      msg: 'hello',
      correlationId: 'c-1',
      schoolId: 's-1',
    });
  });

  it('redacts credentials, PII and answer content in structured fields', () => {
    const { lines, logger } = capture();
    logger.info(
      {
        password: 'p',
        body: { email: 'e@x.io', otp: '123456' },
        attempt: { id: 'a1', answers: ['x'] },
        req: { headers: { cookie: 'atlas_session=abc', 'x-csrf-token': 't' } },
      },
      'evt',
    );
    const line = JSON.stringify(lines[0]);
    for (const secret of ['"p"', 'e@x.io', '123456', '["x"]', 'atlas_session=abc', '"t"']) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain('"id":"a1"');
  });

  it('scrubs message text and serialised errors', () => {
    const { lines, logger } = capture();
    logger.error({ err: new Error('failed for bob@example.com') }, 'reset link ?token=zz9 failed');
    const line = JSON.stringify(lines[0]);
    expect(line).not.toContain('bob@example.com');
    expect(line).not.toContain('zz9');
    expect((lines[0]!.err as Record<string, unknown>).type).toBe('Error');
  });
});
