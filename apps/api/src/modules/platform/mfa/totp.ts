import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * B20: RFC 6238 TOTP (HMAC-SHA1, 30-second step, 6 digits) on `node:crypto`
 * alone — the algorithm is ~30 lines and fully specified, so a dependency
 * would add supply-chain surface for no capability gain (AGENTS.md §9).
 * Verified against RFC 6238 Appendix B's published vectors in
 * `totp.test.ts`. SHA-1 is what every authenticator app implements by
 * default; it is used here as an HMAC, where SHA-1's collision weakness is
 * not relevant.
 */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next step too — authenticator clocks drift. */
export const TOTP_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/u, '').replace(/\s+/gu, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('Invalid base32 character.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret, RFC 4226 §4's recommended length. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totpAt(secretBase32: string, step: number): string {
  return hotp(base32Decode(secretBase32), step);
}

/**
 * Returns the matched time-step, or null. `notAfterStep` is the credential's
 * `lastUsedStep`: a code for that step or any earlier one is refused, so a
 * code observed in transit (shoulder-surfed, logged by a proxy) can't be
 * replayed inside its validity window.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { atMs?: number; notAfterStep?: number | null } = {},
): number | null {
  if (!/^\d{6}$/u.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = timeStep(opts.atMs);
  const given = Buffer.from(code);
  let matched: number | null = null;
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta += 1) {
    const step = current + delta;
    const expected = Buffer.from(hotp(secret, step));
    // Compare every candidate (no early exit) so timing doesn't reveal
    // which window position matched.
    if (timingSafeEqual(expected, given) && matched === null) matched = step;
  }
  if (matched === null) return null;
  if (
    opts.notAfterStep !== undefined &&
    opts.notAfterStep !== null &&
    matched <= opts.notAfterStep
  ) {
    return null;
  }
  return matched;
}

/** `otpauth://` URI every authenticator app accepts as a QR payload. The
 * issuer is the configured product name — never hardcoded (PROJECT.md). */
export function otpauthUri(params: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
