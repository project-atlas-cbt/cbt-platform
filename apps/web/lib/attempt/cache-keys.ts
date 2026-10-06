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
/** Bug audit P3-10: the service worker's own cache for presigned media
 * requests, keyed by signed URL. It used to share `MEDIA_CACHE_NAME`, where
 * attempt cleanup (which deletes by synthetic key) never reached its
 * entries, so exam images stayed on lab PCs. Entries expire (`app/sw.ts`),
 * and cleanup deletes the attempt's last signed URLs from it. */
export const SW_MEDIA_CACHE_NAME = 'atlas-exam-media-sw-v1';
/** Prefix of every synthetic key above; anything else in `MEDIA_CACHE_NAME`
 * was left there by an older service worker. */
export const SYNTHETIC_MEDIA_KEY_PREFIX = 'https://atlas-exam-media.invalid/';

export function mediaCacheKey(mediaAssetId: string): string {
  return `${SYNTHETIC_MEDIA_KEY_PREFIX}${mediaAssetId}`;
}

export function encryptedCacheKey(examId: string, mediaAssetId: string): string {
  return `${SYNTHETIC_MEDIA_KEY_PREFIX}enc/${examId}/${mediaAssetId}`;
}
