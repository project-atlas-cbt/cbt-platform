import { describe, expect, it } from 'vitest';
import { buildErrorEnvelope, isErrorEnvelope } from './error-envelope.js';

describe('error envelope (ADR-0033)', () => {
  it('serialises the required shape with default retryability from the base code', () => {
    const envelope = buildErrorEnvelope({
      code: 'NOT_FOUND',
      message: 'Resource not found.',
      correlationId: '01J000000000000000000000',
    });

    expect(envelope).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found.',
        retryable: false,
        correlationId: '01J000000000000000000000',
      },
    });
    expect(isErrorEnvelope(envelope)).toBe(true);
  });

  it('marks known-retryable base codes as retryable by default', () => {
    const envelope = buildErrorEnvelope({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Try again shortly.',
      correlationId: '01J000000000000000000001',
    });
    expect(envelope.error.retryable).toBe(true);
  });

  it('carries field-level details when provided', () => {
    const envelope = buildErrorEnvelope({
      code: 'VALIDATION_ERROR',
      message: 'Invalid payload.',
      correlationId: '01J000000000000000000002',
      details: { field: 'email', reason: 'invalid format' },
    });
    expect(envelope.error.details).toEqual({ field: 'email', reason: 'invalid format' });
  });

  it('allows an explicit retryable override for a domain-specific code', () => {
    const envelope = buildErrorEnvelope({
      code: 'ATTEMPT_EXPIRED',
      message: 'The attempt window has closed.',
      correlationId: '01J000000000000000000003',
      retryable: false,
    });
    expect(envelope.error.retryable).toBe(false);
  });
});
