import { v7 as uuidv7, validate as uuidValidate, version as uuidVersion } from 'uuid';

/**
 * ADR-0033: the Idempotency-Key header is a client-generated UUIDv7, one per
 * logical operation (start attempt, save answer, submit, import confirm,
 * administrative commands).
 */
export function isValidIdempotencyKey(value: string): boolean {
  return uuidValidate(value) && uuidVersion(value) === 7;
}

/** Convenience generator for tests, seed scripts, and the B0 spike — never used server-side to fabricate a client key. */
export function generateIdempotencyKey(): string {
  return uuidv7();
}
