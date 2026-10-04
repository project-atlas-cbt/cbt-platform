'use client';

import { useEffect, useState } from 'react';
import { apiClient, unwrap } from '@/lib/api';
import { getAttemptDb, type MediaManifestRow } from './db';
import { MEDIA_CACHE_NAME, mediaCacheKey } from './cache-keys';

const CACHE_NAME = MEDIA_CACHE_NAME;
/** Small, bandwidth-gentle concurrency for school-network conditions
 * (doctrine's own low-end-hardware/constrained-network posture). */
const DOWNLOAD_CONCURRENCY = 3;
const MAX_RETRIES_PER_ASSET = 2;

export { MEDIA_CACHE_NAME, mediaCacheKey };

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

/**
 * Bug fix: re-signs every media URL for this attempt from a fresh
 * `GET /attempts/:id`, without touching answer/question reconciliation
 * (`resume.ts` owns that — importing it here would create a cycle, since
 * `resume.ts` already imports this module). This is the only real way to
 * repair an evicted-while-online cache entry whose manifest `url` has
 * itself already expired — retrying `fetchAndCacheOne` with that same
 * expired URL is guaranteed to fail (it's an expired S3 signature).
 * De-duplicated per attempt so multiple `<QuestionMedia>` instances
 * discovering the same problem at once don't each fire their own request.
 * Returns `true` only if the refresh actually succeeded.
 */
const inFlightManifestRefreshes = new Map<string, Promise<boolean>>();

export async function refreshMediaManifestUrls(attemptId: string): Promise<boolean> {
  const existing = inFlightManifestRefreshes.get(attemptId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const response = await unwrap(
        apiClient.GET('/attempts/{id}', { params: { path: { id: attemptId } } }),
      );
      await buildMediaManifestFromPackage(
        attemptId,
        response.questions.map((question) => ({
          examQuestionId: question.examQuestionId,
          media: question.media,
        })),
      );
      return true;
    } catch {
      return false;
    } finally {
      inFlightManifestRefreshes.delete(attemptId);
    }
  })();
  inFlightManifestRefreshes.set(attemptId, promise);
  return promise;
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

      // F20: the local cache first. Media is cached before the runtime
      // opens (ADR-0021, and since F20 pre-cached before Start); reading the
      // signed URL first made every student in a lab re-download each image
      // over the shared link at the bell — exactly the bandwidth B21 showed
      // a lab does not have. The signed URL stays the fallback.
      const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null;
      const cached = cache ? await cache.match(mediaCacheKey(mediaAssetId)) : undefined;
      if (!cached && online && urlStillValid && row.cacheStatus !== 'cached') {
        if (!cancelled) setResolution({ status: 'ready', src: row.url });
        return;
      }

      if (!cached) {
        // Manifest believed this was cached, but it's gone — eviction.
        if (row.cacheStatus === 'cached') {
          await db.mediaManifest.update([attemptId, mediaAssetId], {
            cacheStatus: 'stale-needs-refetch',
          });
        }
        if (online) {
          if (urlStillValid) {
            void fetchAndCacheOne(row);
          } else {
            // Bug fix: `row.url` is the very thing that made us fall
            // through here — retrying it would only fail again (an
            // expired signed URL). The only real fix is a fresh one from
            // the server; fetch it now and use it directly rather than
            // repeating a doomed request and leaving the student staring
            // at "unavailable" while genuinely online.
            const refreshed = await refreshMediaManifestUrls(attemptId);
            if (refreshed) {
              const freshRow = await db.mediaManifest.get([attemptId, mediaAssetId]);
              if (freshRow && Date.now() < Date.parse(freshRow.urlExpiresAt)) {
                if (!cancelled) setResolution({ status: 'ready', src: freshRow.url });
                void fetchAndCacheOne(freshRow);
                return;
              }
            }
          }
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
