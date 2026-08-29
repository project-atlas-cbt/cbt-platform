import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '@/lib/api';
import { resolveLoginErrorMessage } from './resolve-login-error';

const GENERIC = 'Incorrect username/ID or password. Please try again.';

describe('resolveLoginErrorMessage', () => {
  it('collapses UNAUTHENTICATED to the generic message — enumeration-resistance is preserved', () => {
    const err = new ApiError({
      code: 'UNAUTHENTICATED',
      message: 'Invalid credentials.',
      retryable: false,
      correlationId: 'test',
    });
    expect(resolveLoginErrorMessage(err, GENERIC)).toBe(GENERIC);
  });

  it('surfaces a non-login ApiError (e.g. a CSRF rejection) verbatim', () => {
    const err = new ApiError({
      code: 'FORBIDDEN',
      message: 'Missing or invalid CSRF token.',
      retryable: false,
      correlationId: 'test',
    });
    expect(resolveLoginErrorMessage(err, GENERIC)).toBe('Missing or invalid CSRF token.');
  });

  it('surfaces a validation ApiError verbatim', () => {
    const err = new ApiError({
      code: 'VALIDATION_ERROR',
      message: 'One or more fields failed validation.',
      retryable: false,
      correlationId: 'test',
    });
    expect(resolveLoginErrorMessage(err, GENERIC)).toBe('One or more fields failed validation.');
  });

  it('surfaces a NetworkError message verbatim', () => {
    expect(resolveLoginErrorMessage(new NetworkError(), GENERIC)).toBe(
      'Could not reach the server. Check your connection and try again.',
    );
  });

  it('falls back to the generic message for anything unrecognised', () => {
    expect(resolveLoginErrorMessage(new Error('boom'), GENERIC)).toBe(GENERIC);
    expect(resolveLoginErrorMessage('not even an Error', GENERIC)).toBe(GENERIC);
  });
});
