import { prisma, withTenant } from '@atlas/db';
import type { ObjectStorageService } from '../../storage/object-storage.service.js';
import type { AttemptSnapshotDocumentV1 } from './attempt-snapshot.types.js';

/** ADR-0021: signed URLs need only outlive the client's initial download
 * window at attempt start (or a resume's re-download after a cache
 * eviction) — deliberately short, matching `MediaService.getSignedUrl`'s
 * own `QUESTION_MEDIA_DOWNLOAD_TTL_SECONDS` precedent for the same class
 * of asset. Never stored — regenerated fresh on every `GET`. */
const ATTEMPT_MEDIA_DOWNLOAD_TTL_SECONDS = 15 * 60;

export interface ResolvedMediaUrl {
  url: string;
  expiresAt: string;
}

/**
 * ADR-0021's "media manifest in the attempt package" requirement: every
 * media asset referenced anywhere in the frozen snapshot document,
 * resolved to a fresh signed URL in one batched read (never one query per
 * asset — a media-heavy exam under a lab-start burst is exactly the case
 * `R-09`/this ADR's own "Harder" consequence flags). Deduplicated by
 * `mediaAssetId`, since the same asset may be attached to more than one
 * question.
 *
 * Deliberately tolerant of a missing/not-`READY` asset (should be
 * structurally impossible — B8's own immutability trigger prevents a
 * `QuestionMedia` row from detaching after its parent revision is
 * `APPROVED` — but the manifest degrades to omitting that one asset's
 * entry rather than failing the whole attempt-start/resume call): the
 * client-side re-fetch-on-eviction requirement (ADR-0021) already has to
 * tolerate an unresolved asset, so this function does too.
 */
export async function resolveMediaManifest(
  storage: ObjectStorageService,
  schoolId: string,
  document: AttemptSnapshotDocumentV1,
): Promise<Map<string, ResolvedMediaUrl>> {
  const assetIds = [
    ...new Set(document.questions.flatMap((q) => q.media.map((m) => m.mediaAssetId))),
  ];
  if (assetIds.length === 0) return new Map();

  const assets = await withTenant(prisma, schoolId, (tx) =>
    tx.mediaAsset.findMany({
      where: { schoolId, id: { in: assetIds }, status: 'READY' },
      select: { id: true, storageKey: true },
    }),
  );

  const resolved = new Map<string, ResolvedMediaUrl>();
  for (const asset of assets) {
    const signed = await storage.createSignedDownloadUrl(
      asset.storageKey,
      ATTEMPT_MEDIA_DOWNLOAD_TTL_SECONDS,
    );
    resolved.set(asset.id, { url: signed.url, expiresAt: signed.expiresAt.toISOString() });
  }
  return resolved;
}
