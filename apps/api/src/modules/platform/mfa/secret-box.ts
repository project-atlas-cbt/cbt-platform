import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * B20: AES-256-GCM envelope for the TOTP secret at rest (08 §16 "protect
 * secrets at rest"). A database dump alone never yields a usable second
 * factor — the key lives only in the environment (`MFA_ENCRYPTION_KEY`,
 * a secret-manager value in production, B23).
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>`, each base64url. The version prefix
 * leaves room for key rotation without a schema change. The configured key
 * string is hashed to 32 bytes, so any sufficiently long random value works.
 */
const VERSION = 'v1';

function deriveKey(key: string): Buffer {
  return createHash('sha256').update(key, 'utf8').digest();
}

export function sealSecret(plain: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function openSecret(sealed: string, key: string): string {
  const [version, iv, tag, ciphertext] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Unrecognised sealed-secret format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(key), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
