import { describe, expect, it } from 'vitest';
import { generateIdempotencyKey, isValidIdempotencyKey } from './idempotency-key.js';

describe('idempotency key (ADR-0033)', () => {
  it('accepts a generated UUIDv7', () => {
    expect(isValidIdempotencyKey(generateIdempotencyKey())).toBe(true);
  });

  it('rejects a UUIDv4', () => {
    expect(isValidIdempotencyKey('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')).toBe(false);
  });

  it('rejects a non-UUID string', () => {
    expect(isValidIdempotencyKey('not-a-uuid')).toBe(false);
  });
});
