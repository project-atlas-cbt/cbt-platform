import { prisma, withTenant } from '@atlas/db';
import type { ObjectStorageService } from './object-storage.service.js';

/** Long-lived relative to question media, per ADR-0021's "logo may be
 * cacheable" allowance — still a signed, expiring URL, never a bare public
 * object. Re-minted on every branding/tenant-resolve read. */
const LOGO_DOWNLOAD_TTL_SECONDS = 24 * 60 * 60;

/**
 * Shared by `MediaService` (platform module, `GET /v1/school/branding`)
 * and `IdentityController` (`GET /v1/tenant/resolve`) — living here, in
 * `storage/` rather than `modules/media/`, specifically so IdentityModule
 * never needs to import MediaModule to use it. MediaModule's controllers
 * need AuthGuard (IdentityModule) for authorization, so the reverse import
 * would create a real circular module dependency; this codebase's existing
 * precedent (see AccessGateModule's own doc comment on B3's identical
 * problem) is to avoid that architecturally rather than reach for
 * `forwardRef()`. `ObjectStorageService` lives in the `@Global()`
 * StorageModule, so both callers can inject it with no module cycle at
 * all.
 *
 * Never throws — a dangling/superseded logo pointer degrades to "no logo
 * shown," not a broken login page or a 500 on tenant/resolve.
 */
export async function resolveLogoSignedUrl(
  storage: ObjectStorageService,
  schoolId: string,
  logoMediaId: string,
): Promise<string | null> {
  const asset = await withTenant(prisma, schoolId, (tx) =>
    tx.mediaAsset.findUnique({ where: { id: logoMediaId } }),
  );
  if (!asset || asset.schoolId !== schoolId || asset.status !== 'READY') return null;
  const signed = await storage.createSignedDownloadUrl(asset.storageKey, LOGO_DOWNLOAD_TTL_SECONDS);
  return signed.url;
}
