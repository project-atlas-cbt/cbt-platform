import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isKnownBaseErrorCode } from '@atlas/domain';
import { AppHttpException } from './app-http-exception.js';

describe('AppHttpException', () => {
  it('resolves httpStatus and retryable from a known base error code', () => {
    const err = new AppHttpException({ code: 'CONFLICT', message: 'Already exists.' });
    expect(err.httpStatus).toBe(409);
    expect(err.retryable).toBe(false);
  });

  it('resolves retryable=true for SERVICE_UNAVAILABLE', () => {
    const err = new AppHttpException({ code: 'SERVICE_UNAVAILABLE', message: 'Down.' });
    expect(err.retryable).toBe(true);
  });

  it('requires an explicit httpStatus for an unknown code', () => {
    expect(() => new AppHttpException({ code: 'ATTEMPT_EXPIRED', message: 'Expired.' })).toThrow(
      /must specify httpStatus/,
    );
  });

  it('accepts an unknown code when httpStatus is supplied explicitly', () => {
    const err = new AppHttpException({
      code: 'ATTEMPT_EXPIRED',
      message: 'Expired.',
      httpStatus: 410,
      retryable: false,
    });
    expect(err.httpStatus).toBe(410);
    expect(err.code).toBe('ATTEMPT_EXPIRED');
  });

  it('lets an explicit retryable override the base code default', () => {
    const err = new AppHttpException({
      code: 'CONFLICT',
      message: 'Retry-worthy conflict.',
      retryable: true,
    });
    expect(err.retryable).toBe(true);
  });
});

describe('AppHttpException codes used in the API source', () => {
  // P2-23: analytics threw `VALIDATION_FAILED`, which is not a code, so every
  // one of its validation errors became a retryable 500. An unknown code
  // without an explicit httpStatus throws in the constructor, so catch it here.
  it('every code thrown without an explicit httpStatus is a known base code', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    const unknown: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(root, file), 'utf8');
      for (const match of source.matchAll(/new AppHttpException\(\{([^}]*)\}/g)) {
        const body = match[1] ?? '';
        const code = /code:\s*'([A-Z_]+)'/.exec(body)?.[1];
        if (code && !body.includes('httpStatus') && !isKnownBaseErrorCode(code))
          unknown.push(`${file}: ${code}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});
