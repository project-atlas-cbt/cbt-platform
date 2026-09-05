'use client';

import { useEffect, useState } from 'react';
import { getAttemptDb, type MediaManifestRow } from './db';

const CACHE_NAME = 'atlas-exam-media-v1';
/** Small, bandwidth-gentle concurrency for school-network conditions
 * (doctrine's own low-end-hardware/constrained-network posture). */
const DOWNLOAD_CONCURRENCY = 3;
const MAX_RETRIES_PER_ASSET = 2;

function mediaCacheKey(mediaAssetId: string): string {
  // A synthetic same-origin URL, not the real signed URL — this is what
  // makes the cache entry's identity survive the signed URL's rotating
  // query-string signature (ADR-0021).
  return `https://atlas-exam-media.invalid/${mediaAssetId}`;
}

interface ServerQuestionMedia {
  mediaAssetId: string;
  displayOrder: number;
  mediaType: string;
  url: string;
  urlExpiresAt: string;
}

/**
 * Flattens + dedupes `questions[].media[]` across the whole attempt package
 * into `mediaManifest` rows, upserting `url`/`urlExpiresAt` for assets
 * already known (this is also the *only* re-sign mechanism — see the
 * module's own limitation note below). There is no separate server-provided
 * top-level manifest field; the frozen contract nests media per question.
 */
export async function buildMediaManifestFromPackage(
  attemptId: string,
  questions: { examQuestionId: string; media: ServerQuestionMedia[] }[],
): Promise<void> {
  const db = getAttemptDb();
  const byAsset = new Map<string, { media: ServerQuestionMedia; examQuestionIds: string[] }>();
  for (const question of questions) {
    for (const media of question.media) {
      const existing = byAsset.get(media.mediaAssetId);
      if (existing) existing.examQuestionIds.push(question.examQuestionId);
      else byAsset.set(media.mediaAssetId, { media, examQuestionIds: [question.examQuestionId] });
    }
  }

  await db.transaction('rw', db.mediaManifest, async () => {
    for (const { media, examQuestionIds } of byAsset.values()) {
      const existing = await db.mediaManifest.get([attemptId, media.mediaAssetId]);
      const row: MediaManifestRow = {
        attemptId,
        mediaAssetId: media.mediaAssetId,
        examQuestionIds,
        url: media.url,
        urlExpiresAt: media.urlExpiresAt,
        mediaType: media.mediaType,
        cacheStatus: existing?.cacheStatus ?? 'pending',
        cachedAt: existing?.cachedAt ?? null,
      };
      await db.mediaManifest.put(row);
    }
  });
}

async function fetchAndCacheOne(row: MediaManifestRow): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const cache = await caches.open(CACHE_NAME);
  for (let attempt = 0; attempt <= MAX_RETRIES_PER_ASSET; attempt += 1) {
    try {
      const response = await fetch(row.url);
      if (!response.ok) continue;
      await cache.put(mediaCacheKey(row.mediaAssetId), response.clone());
      return true;
    } catch {
      // retry
    }
  }
  return false;
}

/** Downloads every not-yet-cached asset for an attempt into Cache Storage,
 * reporting progress as it goes. Called from the preview screen right after
 * `POST /exams/:id/attempts` succeeds and before "Continue to exam" is
 * enabled (ADR-0021: blocks Start, not after it). Returns `true` only if
 * every asset was successfully cached. */
export async function downloadAllMedia(
  attemptId: string,
  onProgress: (completed: number, total: number) => void,
): Promise<boolean> {
  const db = getAttemptDb();
  const rows = await db.mediaManifest.where('attemptId').equals(attemptId).toArray();
  const total = rows.length;
  let completed = 0;
  let allSucceeded = true;
  onProgress(completed, total);

  const queue = [...rows];
  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      if (row.cacheStatus === 'cached') {
        const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null;
        const hit = cache ? await cache.match(mediaCacheKey(row.mediaAssetId)) : undefined;
        if (hit) {
          completed += 1;
          onProgress(completed, total);
          continue;
        }
      }
      const ok = await fetchAndCacheOne(row);
      await db.mediaManifest.update([attemptId, row.mediaAssetId], {
        cacheStatus: ok ? 'cached' : 'failed',
        cachedAt: ok ? new Date().toISOString() : null,
      });
      if (!ok) allSucceeded = false;
      completed += 1;
      onProgress(completed, total);
    }
  };

  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, total || 1) }, worker));
  return allSucceeded;
}

interface MediaAssetResolution {
  status: 'loading' | 'ready' | 'unavailable';
  src: string | null;
}

/**
 * Resolves one media asset's renderable `src` for `question-media.tsx`:
 * online with a still-valid signed URL uses it directly (which also
 * opportunistically warms the SW's own runtime-caching rule, see `sw.ts`);
 * otherwise falls back to the cached blob via an object URL.
 *
 * **Eviction detection**: if the manifest says `'cached'` but the cache
 * entry is actually gone (browsers can evict Cache Storage under pressure
 * with no notice), this flips the row to `'stale-needs-refetch'` and, if
 * online, re-fetches immediately.
 *
 * **Confirmed decision (2026-09-05)**: if offline and evicted, this never
 * blocks the student — it resolves to `'unavailable'` so the caller shows an
 * honest placeholder and the question remains answerable normally.
 */
export function useMediaAssetUrl(
  attemptId: string | undefined,
  mediaAssetId: string,
): MediaAssetResolution {
  const [resolution, setResolution] = useState<MediaAssetResolution>({
    status: 'loading',
    src: null,
  });

  useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    const resolve = async () => {
      const db = getAttemptDb();
      const row = await db.mediaManifest.get([attemptId, mediaAssetId]);
      if (!row) {
        if (!cancelled) setResolution({ status: 'unavailable', src: null });
        return;
      }

      const online = typeof navigator === 'undefined' || navigator.onLine;
      const urlStillValid = Date.now() < Date.parse(row.urlExpiresAt);
      if (online && urlStillValid) {
        if (!cancelled) setResolution({ status: 'ready', src: row.url });
        return;
      }

      const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null;
      const cached = cache ? await cache.match(mediaCacheKey(mediaAssetId)) : undefined;

      if (!cached) {
        // Manifest believed this was cached, but it's gone — eviction.
        if (row.cacheStatus === 'cached') {
          await db.mediaManifest.update([attemptId, mediaAssetId], {
            cacheStatus: 'stale-needs-refetch',
          });
          if (online) void fetchAndCacheOne(row);
        }
        if (!cancelled) setResolution({ status: 'unavailable', src: null });
        return;
      }

      const blob = await cached.blob();
      objectUrl = URL.createObjectURL(blob);
      if (!cancelled) setResolution({ status: 'ready', src: objectUrl });
    };

    void resolve();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attemptId, mediaAssetId]);

  return resolution;
}

/**
 * Known, accepted limitation (not a workaround-able gap): the only way to
 * get a fresh signed URL for re-fetch is a full `GET /attempts/:id`
 * (`resume.ts` already performs this on reconnect) — an eviction detected
 * while genuinely offline cannot be repaired until the device is back
 * online *and* that call has completed. Recorded here per the phase's own
 * plan rather than solved with a guessed/stale-URL workaround.
 */
export const MEDIA_RESIGN_LIMITATION_NOTE =
  'Media re-signing requires a fresh GET /attempts/:id round trip; there is no dedicated re-sign endpoint.';
