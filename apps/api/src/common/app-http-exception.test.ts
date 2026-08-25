import { describe, expect, it } from 'vitest';
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
