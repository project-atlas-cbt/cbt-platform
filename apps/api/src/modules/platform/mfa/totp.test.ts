import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  timeStep,
  totpAt,
  verifyTotp,
} from './totp.js';

// RFC 6238 Appendix B: the SHA-1 seed is the ASCII string
// "12345678901234567890"; vectors are 8-digit, so they're checked through
// hotp() with digits=8 at the RFC's own T values.
const RFC_SEED = Buffer.from('12345678901234567890', 'ascii');
const RFC_VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(RFC_VECTORS)('matches the RFC 6238 SHA-1 vector at T=%i', (seconds, expected) => {
    expect(hotp(RFC_SEED, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it('round-trips base32', () => {
    const buf = Buffer.from('12345678901234567890', 'ascii');
    expect(base32Encode(buf)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).toEqual(buf);
  });

  it('generates a 160-bit secret', () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });

  it('accepts the current code and ±1 step, rejects ±2', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const step = timeStep(now);
    expect(verifyTotp(secret, totpAt(secret, step), { atMs: now })).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), { atMs: now })).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), { atMs: now })).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step - 2), { atMs: now })).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step + 2), { atMs: now })).toBeNull();
  });

  it('refuses a replayed code (step at or below lastUsedStep)', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const step = timeStep(now);
    const code = totpAt(secret, step);
    expect(verifyTotp(secret, code, { atMs: now, notAfterStep: step })).toBeNull();
    expect(verifyTotp(secret, code, { atMs: now, notAfterStep: step - 1 })).toBe(step);
  });

  it('rejects malformed codes without throwing', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '12345')).toBeNull();
    expect(verifyTotp(secret, 'abcdef')).toBeNull();
    expect(verifyTotp(secret, '1234567')).toBeNull();
  });

  it('builds an otpauth URI with the configured issuer', () => {
    const uri = otpauthUri({ issuer: 'Product X', account: 'a@b.c', secret: 'ABC' });
    expect(uri).toMatch(/^otpauth:\/\/totp\/Product%20X%3Aa%40b\.c\?/);
    expect(uri).toContain('issuer=Product+X');
    expect(uri).toContain('secret=ABC');
  });
});
