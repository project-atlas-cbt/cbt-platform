import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ciphertextStorageKey,
  decryptMedia,
  deriveExamMediaKey,
  encryptMedia,
  sha256Hex,
} from './precache-crypto.js';

const SECRET = 'x'.repeat(40);
const SCHOOL = '0190a000-0000-7000-8000-000000000001';
const EXAM_A = '0190a000-0000-7000-8000-0000000000aa';
const EXAM_B = '0190a000-0000-7000-8000-0000000000bb';

describe('pre-cache crypto (F20, ADR-0021 amendment)', () => {
  it('derives a stable 256-bit key per exam, distinct across exams and schools', () => {
    const a = deriveExamMediaKey(SECRET, SCHOOL, EXAM_A);
    expect(a).toHaveLength(32);
    expect(deriveExamMediaKey(SECRET, SCHOOL, EXAM_A).equals(a)).toBe(true);
    expect(deriveExamMediaKey(SECRET, SCHOOL, EXAM_B).equals(a)).toBe(false);
    expect(deriveExamMediaKey(SECRET, EXAM_B, EXAM_A).equals(a)).toBe(false);
    expect(deriveExamMediaKey('y'.repeat(40), SCHOOL, EXAM_A).equals(a)).toBe(false);
  });

  it('round-trips, never reuses an IV, and hides the plaintext', () => {
    const key = deriveExamMediaKey(SECRET, SCHOOL, EXAM_A);
    const image = Buffer.from('\x89PNG fake image bytes '.repeat(50));
    const one = encryptMedia(key, image);
    const two = encryptMedia(key, image);
    expect(one.equals(two)).toBe(false);
    expect(one.includes(Buffer.from('fake image'))).toBe(false);
    expect(one).toHaveLength(image.length + 12 + 16);
    expect(decryptMedia(key, one).equals(image)).toBe(true);
  });

  it('rejects tampering and the wrong exam key', () => {
    const key = deriveExamMediaKey(SECRET, SCHOOL, EXAM_A);
    const blob = encryptMedia(key, Buffer.from('diagram'));
    const flipped = Buffer.from(blob);
    flipped[14] = flipped[14]! ^ 1;
    expect(() => decryptMedia(key, flipped)).toThrow();
    expect(() => decryptMedia(deriveExamMediaKey(SECRET, SCHOOL, EXAM_B), blob)).toThrow();
  });

  it('is decryptable by Web Crypto exactly as the browser does it', async () => {
    const key = deriveExamMediaKey(SECRET, SCHOOL, EXAM_A);
    const image = Buffer.from('question 17 diagram');
    const blob = encryptMedia(key, image);
    const cryptoKey = await webcrypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
    const plain = await webcrypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.subarray(0, 12) },
      cryptoKey,
      blob.subarray(12),
    );
    expect(Buffer.from(plain).equals(image)).toBe(true);
  });

  it('names objects under the 09 §22 school prefix and hashes in hex', () => {
    expect(ciphertextStorageKey(SCHOOL, EXAM_A, 'm1')).toBe(
      `schools/${SCHOOL}/precache/${EXAM_A}/m1.bin`,
    );
    expect(sha256Hex(Buffer.from(''))).toMatch(/^[0-9a-f]{64}$/);
  });
});
