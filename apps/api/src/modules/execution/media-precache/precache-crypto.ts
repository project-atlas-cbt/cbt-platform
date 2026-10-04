import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

/**
 * F20 — encrypted media pre-cache (ADR-0021 amendment, owner decision
 * 2026-10-03). Ciphertext layout, chosen so the browser can decrypt with
 * plain Web Crypto `AES-GCM` and no parsing beyond one slice:
 *
 *   [ 12-byte IV ][ ciphertext ][ 16-byte GCM tag ]
 *
 * (Web Crypto's `decrypt({ name: 'AES-GCM', iv }, key, data)` expects
 * `data = ciphertext ‖ tag`, i.e. everything after the IV.)
 *
 * The key is per exam and **derived, never stored**:
 * `HKDF-SHA256(secret, salt = schoolId, info = "exam-media:v1:" + examId)`.
 * Why per exam: pools are deferred (ADR-0002), so every student sees the
 * same media; a student who has started can already see it, so sharing the
 * key needs collusion that leaks the content anyway. What this closes is a
 * student viewing the paper's media on their own machine before their own
 * timer starts.
 */

export const MEDIA_KEY_INFO_PREFIX = 'exam-media:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Non-production fallback only — `MEDIA_PRECACHE_SECRET` is mandatory in
 * production (packages/config refuses to boot without it). */
export const DEV_FALLBACK_MEDIA_PRECACHE_SECRET =
  'dev-only-media-precache-secret-never-use-in-production';

export function deriveExamMediaKey(secret: string, schoolId: string, examId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, schoolId, `${MEDIA_KEY_INFO_PREFIX}${examId}`, 32));
}

export function encryptMedia(
  key: Buffer,
  plaintext: Buffer,
  iv: Buffer = randomBytes(IV_BYTES),
): Buffer {
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]);
}

/** The inverse of `encryptMedia` — used by tests and the load harness; the
 * browser does the same with Web Crypto. Throws on any tampering. */
export function decryptMedia(key: Buffer, blob: Buffer): Buffer {
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const body = blob.subarray(IV_BYTES, blob.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** 09 §22 key shape: schools/SCHOOL_ID/CATEGORY/… — category `precache`. */
export function ciphertextStorageKey(
  schoolId: string,
  examId: string,
  mediaAssetId: string,
): string {
  return `schools/${schoolId}/precache/${examId}/${mediaAssetId}.bin`;
}
