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

/**
 * Engineering defaults — none of these are specified in the docs. Easy to
 * tune later; recorded here as the single place they're set, not scattered
 * across call sites.
 */
export const CONTENT_LIMITS: Record<MediaAssetUploadableType | 'SCHOOL_LOGO', ContentLimits> = {
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
};

export type ValidationFailureCode =
  'MEDIA_TOO_LARGE' | 'MEDIA_CONTENT_TYPE_MISMATCH' | 'MEDIA_DIMENSIONS_INVALID';

export type ValidationResult =
  | { ok: true; sniffedMimeType: string; width?: number; height?: number }
  | { ok: false; code: ValidationFailureCode; reason: string };

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
  if (!sniffed || !limits.allowedMimeTypes.includes(sniffed.mime)) {
    return {
      ok: false,
      code: 'MEDIA_CONTENT_TYPE_MISMATCH',
      reason: sniffed
        ? `Sniffed content type "${sniffed.mime}" is not permitted for this asset type.`
        : 'Content could not be identified as any permitted type — reject by content, not extension.',
    };
  }

  const needsDimensionCheck =
    limits.minWidth !== undefined ||
    limits.minHeight !== undefined ||
    limits.maxWidth !== undefined ||
    limits.maxHeight !== undefined;
  if (!needsDimensionCheck) {
    return { ok: true, sniffedMimeType: sniffed.mime };
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
    return { ok: true, sniffedMimeType: sniffed.mime, width, height };
  } catch {
    return {
      ok: false,
      code: 'MEDIA_DIMENSIONS_INVALID',
      reason: 'Could not read image dimensions from the uploaded content.',
    };
  }
}
