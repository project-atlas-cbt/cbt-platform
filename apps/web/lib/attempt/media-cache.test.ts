import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { buildMediaManifestFromPackage, downloadAllMedia, useMediaAssetUrl } from './media-cache';
import { getAttemptDb, clearAttemptData } from './db';

const ATTEMPT_ID = 'attempt-media-1';

describe('buildMediaManifestFromPackage', () => {
  beforeEach(async () => {
    await clearAttemptData(ATTEMPT_ID);
  });

  it('flattens and dedupes media referenced by more than one question', async () => {
    await buildMediaManifestFromPackage(ATTEMPT_ID, [
      {
        examQuestionId: 'q1',
        media: [
          {
            mediaAssetId: 'm1',
            displayOrder: 1,
            mediaType: 'IMAGE',
            url: 'https://x/m1',
            urlExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
      },
      {
        examQuestionId: 'q2',
        media: [
          {
            mediaAssetId: 'm1',
            displayOrder: 1,
            mediaType: 'IMAGE',
            url: 'https://x/m1',
            urlExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
      },
    ]);

    const db = getAttemptDb();
    const rows = await db.mediaManifest.where('attemptId').equals(ATTEMPT_ID).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.examQuestionIds.sort()).toEqual(['q1', 'q2']);
  });

  it('re-signing (a later call) updates url/urlExpiresAt without resetting cacheStatus', async () => {
    await buildMediaManifestFromPackage(ATTEMPT_ID, [
      {
        examQuestionId: 'q1',
        media: [
          {
            mediaAssetId: 'm1',
            displayOrder: 1,
            mediaType: 'IMAGE',
            url: 'https://x/old',
            urlExpiresAt: new Date().toISOString(),
          },
        ],
      },
    ]);
    const db = getAttemptDb();
    await db.mediaManifest.update([ATTEMPT_ID, 'm1'], { cacheStatus: 'cached' });

    const freshExpiry = new Date(Date.now() + 900_000).toISOString();
    await buildMediaManifestFromPackage(ATTEMPT_ID, [
      {
        examQuestionId: 'q1',
        media: [
          {
            mediaAssetId: 'm1',
            displayOrder: 1,
            mediaType: 'IMAGE',
            url: 'https://x/new',
            urlExpiresAt: freshExpiry,
          },
        ],
      },
    ]);

    const row = await db.mediaManifest.get([ATTEMPT_ID, 'm1']);
    expect(row?.url).toBe('https://x/new');
    expect(row?.urlExpiresAt).toBe(freshExpiry);
    expect(row?.cacheStatus).toBe('cached');
  });
});

/**
 * jsdom has no Cache Storage API — `downloadAllMedia`/`useMediaAssetUrl`
 * both guard on `typeof caches === 'undefined'` and degrade to "not
 * cached"/"unavailable" rather than throwing, which is exactly the offline-
 * without-eviction-repair path this test exercises.
 */
describe('useMediaAssetUrl (no Cache Storage available, matching a real offline+evicted device)', () => {
  beforeEach(async () => {
    await clearAttemptData(ATTEMPT_ID);
  });

  it('resolves "ready" with the direct URL when online and unexpired', async () => {
    await buildMediaManifestFromPackage(ATTEMPT_ID, [
      {
        examQuestionId: 'q1',
        media: [
          {
            mediaAssetId: 'm1',
            displayOrder: 1,
            mediaType: 'IMAGE',
            url: 'https://x/m1',
            urlExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
      },
    ]);
    const { result } = renderHook(() => useMediaAssetUrl(ATTEMPT_ID, 'm1'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.src).toBe('https://x/m1');
  });

  /**
   * Confirmed decision (2026-09-05): never blocks answering — an
   * unresolvable asset (here, an expired URL with no Cache Storage to fall
   * back to, the jsdom stand-in for "offline and evicted") resolves to the
   * honest 'unavailable' status `question-media.tsx` renders a placeholder
   * for, not an error.
   */
  it('resolves "unavailable" (never throws) when the URL has expired and no cache entry exists', async () => {
    await buildMediaManifestFromPackage(ATTEMPT_ID, [
      {
        examQuestionId: 'q1',
        media: [
          {
            mediaAssetId: 'm1',
            displayOrder: 1,
            mediaType: 'IMAGE',
            url: 'https://x/m1',
            urlExpiresAt: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      },
    ]);
    const { result } = renderHook(() => useMediaAssetUrl(ATTEMPT_ID, 'm1'));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.src).toBeNull();
  });

  it('an unknown asset id resolves to "unavailable"', async () => {
    const { result } = renderHook(() => useMediaAssetUrl(ATTEMPT_ID, 'does-not-exist'));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });
});

describe('downloadAllMedia (no Cache Storage available)', () => {
  beforeEach(async () => {
    await clearAttemptData(ATTEMPT_ID);
  });

  it('reports every asset as failed rather than throwing, and reports progress up to the total', async () => {
    await buildMediaManifestFromPackage(ATTEMPT_ID, [
      {
        examQuestionId: 'q1',
        media: [
          {
            mediaAssetId: 'm1',
            displayOrder: 1,
            mediaType: 'IMAGE',
            url: 'https://x/m1',
            urlExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
      },
    ]);
    const progressCalls: [number, number][] = [];
    const succeeded = await downloadAllMedia(ATTEMPT_ID, (completed, total) =>
      progressCalls.push([completed, total]),
    );
    expect(succeeded).toBe(false);
    expect(progressCalls.at(-1)).toEqual([1, 1]);
  });

  it('an attempt with no media resolves immediately as succeeded', async () => {
    const succeeded = await downloadAllMedia(ATTEMPT_ID, () => undefined);
    expect(succeeded).toBe(true);
  });
});
