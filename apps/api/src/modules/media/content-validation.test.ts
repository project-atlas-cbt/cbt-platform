import { describe, expect, it } from 'vitest';
import { CONTENT_LIMITS, validateContent } from './content-validation.js';

// 1x1 red pixel PNG — real bytes, real magic-byte signature, real
// (trivial) dimensions. Used to prove the sniffing/dimension pipeline
// against genuine content rather than a mocked file-type/image-size call.
const REAL_PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('validateContent', () => {
  it('rejects content larger than the type-specific limit before sniffing', async () => {
    const result = await validateContent({
      prefix: REAL_PNG_1x1,
      sizeBytes: CONTENT_LIMITS.QUESTION_IMAGE.maxSizeBytes + 1,
      limits: CONTENT_LIMITS.QUESTION_IMAGE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MEDIA_TOO_LARGE');
  });

  it('rejects by content sniffing, not extension — plain text bytes never pass', async () => {
    const result = await validateContent({
      prefix: Buffer.from('not an image, just plain text bytes'),
      sizeBytes: 36,
      limits: CONTENT_LIMITS.QUESTION_IMAGE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MEDIA_CONTENT_TYPE_MISMATCH');
  });

  it('rejects a real PNG whose sniffed mime is outside the allowed set for the type', async () => {
    // REPORT/OTHER-style limits reused here with a restricted allow-list to
    // prove the allow-list check, not the sniff itself.
    const result = await validateContent({
      prefix: REAL_PNG_1x1,
      sizeBytes: REAL_PNG_1x1.length,
      limits: { maxSizeBytes: 1_000_000, allowedMimeTypes: ['image/webp'] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MEDIA_CONTENT_TYPE_MISMATCH');
  });

  it('rejects a real image below the minimum dimension floor (the logo case)', async () => {
    const result = await validateContent({
      prefix: REAL_PNG_1x1,
      sizeBytes: REAL_PNG_1x1.length,
      limits: CONTENT_LIMITS.SCHOOL_LOGO,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MEDIA_DIMENSIONS_INVALID');
  });

  it('accepts a real PNG within size/type/dimension limits and reports sniffed mime + dimensions', async () => {
    const result = await validateContent({
      prefix: REAL_PNG_1x1,
      sizeBytes: REAL_PNG_1x1.length,
      // QUESTION_IMAGE has no minimum dimension, unlike SCHOOL_LOGO.
      limits: CONTENT_LIMITS.QUESTION_IMAGE,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sniffedMimeType).toBe('image/png');
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    }
  });

  it('accepts content when the type has no dimension constraint at all (OTHER) without attempting to read dimensions', async () => {
    const result = await validateContent({
      prefix: REAL_PNG_1x1,
      sizeBytes: REAL_PNG_1x1.length,
      limits: { maxSizeBytes: 1_000_000, allowedMimeTypes: ['image/png'] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.width).toBeUndefined();
      expect(result.height).toBeUndefined();
    }
  });

  it('P1-10: accepts a CSV prefix cut inside a multi-byte character, at every cut position', async () => {
    const row = 'Q1,"What is ₦50 × 2?",“₦100”,₦50,₦200,A\n';
    const file = Buffer.from(row.repeat(200), 'utf8');
    for (let cut = 4000; cut <= 4100; cut++) {
      const result = await validateContent({
        prefix: file.subarray(0, cut),
        sizeBytes: file.length,
        limits: CONTENT_LIMITS.IMPORT_SOURCE,
      });
      expect(result.ok, `cut at ${cut}`).toBe(true);
    }
  });

  it('P1-10: still rejects bytes that are malformed UTF-8 before the end of the prefix', async () => {
    const result = await validateContent({
      prefix: Buffer.concat([Buffer.from([0xc3, 0x28]), Buffer.from('abc,def\n')]),
      sizeBytes: 11,
      limits: CONTENT_LIMITS.IMPORT_SOURCE,
    });
    expect(result.ok).toBe(false);
  });
});
