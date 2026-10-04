import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { ObjectStorageService } from '../../storage/object-storage.service.js';
import { resolveLogoSignedUrl } from '../../storage/logo-resolver.js';
import { CONTENT_LIMITS, validateContent } from './content-validation.js';
import type {
  MediaAssetSummaryResponseDto,
  MediaAssetUploadableType,
  RequestMediaUploadResponseDto,
  SignedMediaUrlResponseDto,
} from './dto/media.dto.js';

/** Every media type this service can handle, including SCHOOL_LOGO and
 * IMPORT_SOURCE — the DTO-level MediaAssetUploadableType narrows what a
 * *client request to the generic MediaController* may ask for; internally,
 * both the logo upload-target path (school-branding.controller.ts) and the
 * B7 import-file upload-target path (imports.controller.ts) are first-class
 * types too, each with its own dedicated route pair for the same reason
 * SCHOOL_LOGO already has one — see media.module.ts's doc comment. */
type AnyMediaType = MediaAssetUploadableType | 'SCHOOL_LOGO' | 'IMPORT_SOURCE';

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const QUESTION_MEDIA_DOWNLOAD_TTL_SECONDS = 15 * 60;

const STORAGE_FOLDER: Record<AnyMediaType, string> = {
  SCHOOL_LOGO: 'branding',
  QUESTION_IMAGE: 'questions',
  QUESTION_DIAGRAM: 'questions',
  OTHER: 'other',
  IMPORT_SOURCE: 'imports',
};

/** Strips path separators and anything outside a safe charset — the
 * filename is embedded directly into the storage key. */
function sanitizeFilename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, '');
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '_');
  return safe.length > 0 ? safe : 'file';
}

@Injectable()
export class MediaService {
  constructor(private readonly storage: ObjectStorageService) {}

  buildStorageKey(
    schoolId: string,
    type: AnyMediaType,
    mediaAssetId: string,
    filename: string,
  ): string {
    return `schools/${schoolId}/${STORAGE_FOLDER[type]}/${mediaAssetId}/${sanitizeFilename(filename)}`;
  }

  async requestUpload(params: {
    schoolId: string;
    uploaderUserId: string;
    type: AnyMediaType;
    filename: string;
    declaredMimeType: string;
    declaredSizeBytes: number;
  }): Promise<RequestMediaUploadResponseDto> {
    const { schoolId, uploaderUserId, type, filename, declaredMimeType, declaredSizeBytes } =
      params;

    // Fail fast on the client's own declared size, before a presigned URL
    // is even issued — found by live testing (the original design only
    // checked the real, storage-reported size at complete() time, which
    // means a genuinely oversized file would be uploaded in full only to
    // be rejected afterward). The real size is still re-checked in
    // completeUpload() via ObjectStorageService.headObject — this is a
    // fast-fail UX/bandwidth improvement, not a replacement for it, since
    // declaredSizeBytes is client-supplied and never trusted alone.
    const limits = CONTENT_LIMITS[type];
    if (declaredSizeBytes > limits.maxSizeBytes) {
      throw new AppHttpException({
        code: 'MEDIA_TOO_LARGE',
        message: `Declared size ${declaredSizeBytes} bytes exceeds the ${limits.maxSizeBytes}-byte limit for ${type}.`,
      });
    }

    // B20: an image type refuses any declared MIME type it could never
    // accept (e.g. image/svg+xml, text/html) before issuing an upload URL —
    // completeUpload()'s magic-byte sniff remains the authority; this just
    // stops a hostile file ever reaching storage. Import types are exempt:
    // browsers declare CSV inconsistently (text/csv, application/vnd.ms-excel,
    // empty), so their sniff-at-complete check stands alone.
    const declared = declaredMimeType.trim().toLowerCase();
    if (
      limits.allowedMimeTypes.every((m) => m.startsWith('image/')) &&
      !limits.allowedMimeTypes.includes(declared)
    ) {
      throw new AppHttpException({
        code: 'MEDIA_CONTENT_TYPE_MISMATCH',
        message: `Declared type "${declaredMimeType}" is not accepted for ${type}.`,
      });
    }

    const id = randomUUID();
    const storageKey = this.buildStorageKey(schoolId, type, id, filename);
    const uploadUrlExpiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000);

    await withTenant(prisma, schoolId, (tx) =>
      tx.mediaAsset.create({
        data: {
          id,
          schoolId,
          type,
          storageKey,
          originalFilename: filename,
          declaredMimeType,
          declaredSizeBytes,
          uploaderUserId,
          uploadUrlExpiresAt,
        },
      }),
    );

    const target = await this.storage.createUploadTarget({
      storageKey,
      contentType: declaredMimeType,
      contentLength: declaredSizeBytes,
      ttlSeconds: UPLOAD_URL_TTL_SECONDS,
    });

    return {
      mediaAssetId: id,
      uploadUrl: target.uploadUrl,
      expiresAt: target.expiresAt.toISOString(),
    };
  }

  async completeUpload(
    schoolId: string,
    mediaAssetId: string,
  ): Promise<MediaAssetSummaryResponseDto> {
    const asset = await withTenant(prisma, schoolId, (tx) =>
      tx.mediaAsset.findUnique({ where: { id: mediaAssetId } }),
    );
    // RLS makes a cross-school id indistinguishable from "doesn't exist" —
    // the actual 404 mechanism (see rls.integration.test.ts's media_assets
    // block), not an application-level ownership check.
    if (!asset || asset.schoolId !== schoolId) {
      throw new AppHttpException({ code: 'MEDIA_UPLOAD_NOT_FOUND', message: 'No such upload.' });
    }

    if (asset.status !== 'PENDING') {
      // Idempotent: calling complete() twice on an already-resolved asset
      // returns its current state rather than erroring (ADR-0033).
      return this.toSummary(asset);
    }

    // B22: HEAD first, then the window. The presigned PUT URL itself
    // expires at uploadUrlExpiresAt, so an object that exists was uploaded
    // inside the window — even if this complete() call arrives after it
    // (the client retrying through a storage or API outage). Checking the
    // window first rejected exactly those uploads.
    const head = await this.storage.headObject(asset.storageKey);
    if (!head) {
      const expired = asset.uploadUrlExpiresAt.getTime() < Date.now();
      const rejected = await withTenant(prisma, schoolId, (tx) =>
        tx.mediaAsset.update({
          where: { id: mediaAssetId },
          data: {
            status: 'REJECTED',
            rejectionReason: expired ? 'Upload window expired.' : 'No object received.',
          },
        }),
      );
      if (expired) {
        throw new AppHttpException({
          code: 'MEDIA_UPLOAD_EXPIRED',
          message: 'The upload window for this asset has expired.',
          details: { rejectionReason: rejected.rejectionReason },
        });
      }
      throw new AppHttpException({
        code: 'MEDIA_UPLOAD_NOT_RECEIVED',
        message: 'No file was received for this upload.',
      });
    }

    const prefix = await this.storage.getObjectPrefix(asset.storageKey);
    const limits = CONTENT_LIMITS[asset.type as AnyMediaType];
    const result = await validateContent({ prefix, sizeBytes: head.sizeBytes, limits });

    if (!result.ok) {
      await withTenant(prisma, schoolId, (tx) =>
        tx.mediaAsset.update({
          where: { id: mediaAssetId },
          data: { status: 'REJECTED', rejectionReason: result.reason },
        }),
      );
      throw new AppHttpException({ code: result.code, message: result.reason });
    }

    const ready = await withTenant(prisma, schoolId, (tx) =>
      tx.mediaAsset.update({
        where: { id: mediaAssetId },
        data: {
          status: 'READY',
          sniffedMimeType: result.sniffedMimeType,
          ...(result.width !== undefined ? { width: result.width } : {}),
          ...(result.height !== undefined ? { height: result.height } : {}),
        },
      }),
    );

    return this.toSummary(ready);
  }

  /** `GET /v1/media/:id/url` — non-logo assets only; a SCHOOL_LOGO-typed
   * asset is only ever served via the public GET /v1/tenant/resolve embed
   * (see getLogoSignedUrl), keeping "which TTL applies" logic in one place
   * per type. */
  async getSignedUrl(schoolId: string, mediaAssetId: string): Promise<SignedMediaUrlResponseDto> {
    const asset = await withTenant(prisma, schoolId, (tx) =>
      tx.mediaAsset.findUnique({ where: { id: mediaAssetId } }),
    );
    if (!asset || asset.schoolId !== schoolId) {
      throw new AppHttpException({ code: 'MEDIA_UPLOAD_NOT_FOUND', message: 'No such asset.' });
    }
    if (asset.type === 'SCHOOL_LOGO') {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Logo assets are served via GET /v1/tenant/resolve, not this endpoint.',
      });
    }
    if (asset.status !== 'READY') {
      throw new AppHttpException({ code: 'MEDIA_NOT_READY', message: 'This asset is not ready.' });
    }

    const signed = await this.storage.createSignedDownloadUrl(
      asset.storageKey,
      QUESTION_MEDIA_DOWNLOAD_TTL_SECONDS,
    );
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  /**
   * Validates a candidate logo asset before `SchoolBrandingService`
   * assigns it as `School.logoMediaId` — this re-validation (type,
   * status, tenant match) is the real gate for attaching a logo, not a
   * second permission check (see school-branding.service.ts).
   */
  async getReadyLogoAsset(schoolId: string, mediaAssetId: string): Promise<{ id: string } | null> {
    const asset = await withTenant(prisma, schoolId, (tx) =>
      tx.mediaAsset.findUnique({ where: { id: mediaAssetId } }),
    );
    if (!asset || asset.schoolId !== schoolId) return null;
    if (asset.type !== 'SCHOOL_LOGO' || asset.status !== 'READY') return null;
    return { id: asset.id };
  }

  /**
   * B8: the `QUESTION_IMAGE`/`QUESTION_DIAGRAM` mirror of
   * `getReadyLogoAsset` — validated (type, status, tenant) before
   * `QuestionMediaService.attach()` writes the `QuestionMedia` join row,
   * not a second permission check.
   */
  async getReadyQuestionMediaAsset(
    schoolId: string,
    mediaAssetId: string,
  ): Promise<{ id: string } | null> {
    const asset = await withTenant(prisma, schoolId, (tx) =>
      tx.mediaAsset.findUnique({ where: { id: mediaAssetId } }),
    );
    if (!asset || asset.schoolId !== schoolId) return null;
    if (
      (asset.type !== 'QUESTION_IMAGE' && asset.type !== 'QUESTION_DIAGRAM') ||
      asset.status !== 'READY'
    ) {
      return null;
    }
    return { id: asset.id };
  }

  /** Used by `GET /v1/school/branding` (the public `GET /v1/tenant/resolve`
   * calls the shared `resolveLogoSignedUrl` directly instead, specifically
   * so IdentityModule never needs to import MediaModule — see that
   * function's own doc comment). Resolves the current logo asset (if any)
   * to a long-TTL signed URL; never throws — a dangling/superseded pointer
   * degrades to "no logo shown," not a 500. */
  async getLogoSignedUrl(schoolId: string, logoMediaId: string): Promise<string | null> {
    return resolveLogoSignedUrl(this.storage, schoolId, logoMediaId);
  }

  private toSummary(asset: {
    id: string;
    status: string;
    sniffedMimeType: string | null;
    width: number | null;
    height: number | null;
    rejectionReason: string | null;
  }): MediaAssetSummaryResponseDto {
    return {
      id: asset.id,
      status: asset.status as MediaAssetSummaryResponseDto['status'],
      sniffedMimeType: asset.sniffedMimeType,
      width: asset.width,
      height: asset.height,
      rejectionReason: asset.rejectionReason,
    };
  }
}
