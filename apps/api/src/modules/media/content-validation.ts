import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';
import type { MediaAssetUploadableType } from './dto/media.dto.js';

export interface ContentLimits {
  maxSizeBytes: number;
  allowedMimeTypes: readonly string[];
  /** Omitted (not just `undefined` — exactOptionalPropertyTypes) for types
   * with no dimension constraint. */
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

const MB = 1024 * 1024;
// SVG is deliberately excluded from every allow-list: it can embed scripts
// and external references, and can't be reliably magic-byte-sniffed (it's
// text, not a fixed binary signature) — accepting it would defeat "reject
// by content sniffing, not extension" outright.
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

// B7: the only two IMPORT_SOURCE mime types (A-17 — CSV required, .xlsx
// accepted). `.xlsx` is a real zip/OOXML container `file-type` can sniff
// reliably; plain-text CSV cannot be (see looksLikePlainText below).
// Exported for import-file-parser.ts, which branches its CSV-vs-.xlsx
// parser on the same two values rather than duplicating the literals.
export const CSV_MIME_TYPE = 'text/csv';
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Engineering defaults — none of these are specified in the docs. Easy to
 * tune later; recorded here as the single place they're set, not scattered
 * across call sites.
 */
export const CONTENT_LIMITS: Record<
  MediaAssetUploadableType | 'SCHOOL_LOGO' | 'IMPORT_SOURCE',
  ContentLimits
> = {
  SCHOOL_LOGO: {
    maxSizeBytes: 2 * MB,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    minWidth: 64,
    minHeight: 64,
    maxWidth: 4096,
    maxHeight: 4096,
  },
  QUESTION_IMAGE: {
    maxSizeBytes: 5 * MB,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxWidth: 4096,
    maxHeight: 4096,
  },
  QUESTION_DIAGRAM: {
    maxSizeBytes: 5 * MB,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxWidth: 4096,
    maxHeight: 4096,
  },
  OTHER: {
    maxSizeBytes: 10 * MB,
    allowedMimeTypes: IMAGE_MIME_TYPES,
  },
  // A-17's own recommended number, adopted as the engineering default —
  // generous headroom above the DoD's 1,500-row fixture and the import
  // pipeline's own 5,000-row cap (import-validation.service.ts).
  IMPORT_SOURCE: {
    maxSizeBytes: 5 * MB,
    allowedMimeTypes: [CSV_MIME_TYPE, XLSX_MIME_TYPE],
  },
};

export type ValidationFailureCode =
  'MEDIA_TOO_LARGE' | 'MEDIA_CONTENT_TYPE_MISMATCH' | 'MEDIA_DIMENSIONS_INVALID';

export type ValidationResult =
  | { ok: true; sniffedMimeType: string; width?: number; height?: number }
  | { ok: false; code: ValidationFailureCode; reason: string };

/**
 * `file-type`'s magic-byte sniffing cannot identify plain-text CSV — it has
 * no fixed binary signature, the same limitation this file's own header
 * comment already documents for excluding SVG from every image allow-list.
 * This is a shallow "is this plausibly text, not binary" gate, not a
 * structural CSV proof — the real proof is the import validation job
 * actually parsing the file (ImportModule); if it can't parse, the whole
 * import job fails with a clear message. A NUL byte is treated as a strong
 * binary signal plain text never legitimately contains; `TextDecoder`'s
 * `fatal: true` (unlike `Buffer#toString`, which silently replaces invalid
 * sequences with U+FFFD) is what makes this a real decodability check.
 * The import parser checks the whole file's encoding (import-file-parser.ts).
 */
function looksLikePlainText(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  if (buffer.includes(0)) return false;
  try {
    // `stream: true`: the prefix is a fixed byte count, so it can end in the
    // middle of a multi-byte character (₦, ×, a smart quote). A cut sequence
    // is not invalid text; only a malformed one is (bug audit P1-10).
    new TextDecoder('utf-8', { fatal: true }).decode(buffer, { stream: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pure content-sniffing/validation — takes the already-fetched byte prefix
 * (see ObjectStorageService.getObjectPrefix) so it's testable without a
 * real storage backend. `sizeBytes` is the real, storage-reported size
 * (HeadObject), never the client-declared one.
 */
export async function validateContent(params: {
  prefix: Buffer;
  sizeBytes: number;
  limits: ContentLimits;
}): Promise<ValidationResult> {
  const { prefix, sizeBytes, limits } = params;

  if (sizeBytes > limits.maxSizeBytes) {
    return {
      ok: false,
      code: 'MEDIA_TOO_LARGE',
      reason: `${sizeBytes} bytes exceeds the ${limits.maxSizeBytes}-byte limit for this type.`,
    };
  }

  const sniffed = await fileTypeFromBuffer(prefix);
  let sniffedMime = sniffed?.mime;

  if (
    sniffedMime === undefined &&
    limits.allowedMimeTypes.includes('text/csv') &&
    looksLikePlainText(prefix)
  ) {
    sniffedMime = 'text/csv';
  }

  if (sniffedMime === undefined || !limits.allowedMimeTypes.includes(sniffedMime)) {
    return {
      ok: false,
      code: 'MEDIA_CONTENT_TYPE_MISMATCH',
      reason: sniffedMime
        ? `Sniffed content type "${sniffedMime}" is not permitted for this asset type.`
        : 'Content could not be identified as any permitted type — reject by content, not extension.',
    };
  }

  const needsDimensionCheck =
    limits.minWidth !== undefined ||
    limits.minHeight !== undefined ||
    limits.maxWidth !== undefined ||
    limits.maxHeight !== undefined;
  if (!needsDimensionCheck) {
    return { ok: true, sniffedMimeType: sniffedMime };
  }

  try {
    const { width, height } = imageSize(prefix);
    if (
      (limits.minWidth !== undefined && width < limits.minWidth) ||
      (limits.minHeight !== undefined && height < limits.minHeight) ||
      (limits.maxWidth !== undefined && width > limits.maxWidth) ||
      (limits.maxHeight !== undefined && height > limits.maxHeight)
    ) {
      return {
        ok: false,
        code: 'MEDIA_DIMENSIONS_INVALID',
        reason: `${width}x${height} is outside the allowed range for this type.`,
      };
    }
    return { ok: true, sniffedMimeType: sniffedMime, width, height };
  } catch {
    return {
      ok: false,
      code: 'MEDIA_DIMENSIONS_INVALID',
      reason: 'Could not read image dimensions from the uploaded content.',
    };
  }
}
