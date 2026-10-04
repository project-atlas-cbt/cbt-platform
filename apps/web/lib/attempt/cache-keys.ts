/**
 * Cache Storage names and keys shared by the F13 media cache, the F20
 * encrypted pre-cache and attempt cleanup (`db.ts`) — its own module so
 * none of those import each other.
 *
 * Keys are synthetic same-origin-shaped URLs, not the signed URLs, so an
 * entry's identity survives the signature rotating (ADR-0021).
 */
export const MEDIA_CACHE_NAME = 'atlas-exam-media-v1';
export const ENCRYPTED_CACHE_NAME = 'atlas-exam-media-enc-v1';

export function mediaCacheKey(mediaAssetId: string): string {
  return `https://atlas-exam-media.invalid/${mediaAssetId}`;
}

export function encryptedCacheKey(examId: string, mediaAssetId: string): string {
  return `https://atlas-exam-media.invalid/enc/${examId}/${mediaAssetId}`;
}
