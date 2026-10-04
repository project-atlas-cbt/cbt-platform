'use client';

import { apiClient, unwrap } from '@/lib/api';
import { ApiError } from '@/lib/api/error';
import { getAttemptDb } from './db';
import {
  ENCRYPTED_CACHE_NAME,
  MEDIA_CACHE_NAME,
  encryptedCacheKey,
  mediaCacheKey,
} from './cache-keys';

export { ENCRYPTED_CACHE_NAME, encryptedCacheKey };

/**
 * F20 — encrypted media pre-cache, client half (owner decision 2026-10-03;
 * ADR-0021 amendment; server half: `apps/api/.../media-precache/`).
 *
 * B21 measured the failure this fixes: a 40-question paper with 150 KB
 * images is ~6 MB per student; on a 2 Mbit/s lab link a whole lab needs
 * ~16 minutes to cache it, and ADR-0021 blocks Start until media is cached —
 * so a media-heavy paper could never meet the 60 s lab-burst budget.
 *
 * Here the preview downloads the paper's media **encrypted**, as soon as
 * the lab session is open, while the student reads the instructions. The
 * key arrives only in the student's own attempt package at Start; then the
 * ciphertext is decrypted locally into the ordinary F13 media cache
 * (`atlas-exam-media-v1`), so rendering code is unchanged and no question
 * media is viewable before the student's own timer starts.
 *
 * Ciphertext layout (server `precache-crypto.ts`): 12-byte IV ‖ AES-256-GCM
 * ciphertext ‖ 16-byte tag — Web Crypto takes everything after the IV.
 */

const DOWNLOAD_CONCURRENCY = 3;
const MAX_RETRIES_PER_ASSET = 2;
const MAX_NOT_READY_POLLS = 60;

/** Cache Storage and Web Crypto exist only in a secure context (https, or
 * localhost). Without them the pre-cache cannot run and the preview falls
 * back to F13's post-Start download gate. */
export function precacheSupported(): boolean {
  return (
    typeof caches !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined'
  );
}

export type PrecacheOutcome =
  /** Every asset is cached as ciphertext — Start is safe. */
  | { kind: 'ready'; assetCount: number; totalBytes: number }
  /** Pre-cache cannot run here (no secure context / not a participant
   * right now) — fall back to the post-Start download gate. */
  | { kind: 'unavailable'; reason: string }
  /** Network or storage failure — retryable. */
  | { kind: 'failed'; error: unknown };

export interface PrecacheProgress {
  completed: number;
  total: number;
  /** false while the server is still encrypting the paper. */
  serverReady: boolean;
}

type Manifest = {
  ready: boolean;
  totalBytes: number;
  retryAfterSeconds: number | null;
  assets: {
    mediaAssetId: string;
    url: string;
    expiresAt: string;
    byteSize: number;
    sha256: string;
  }[];
};

/** Re-sign this long before a URL's expiry rather than race it. */
const URL_REFRESH_MARGIN_MS = 30_000;
/** Bound on manifest re-fetches for fresh URLs within one pre-cache pass. */
const MAX_URL_REFRESHES = 20;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
    });
  });
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchManifest(examId: string): Promise<Manifest> {
  return unwrap(
    apiClient.GET('/student/assessment/{examId}/media-manifest', {
      params: { path: { examId } },
    }),
  );
}

/**
 * Downloads every encrypted asset of the paper into
 * `ENCRYPTED_CACHE_NAME`, verifying each against the manifest's SHA-256.
 * Idempotent across reloads: an asset already cached is not fetched again
 * (a lab machine that warmed the paper earlier in the session starts
 * instantly).
 */
export async function precacheExamMedia(
  examId: string,
  onProgress: (p: PrecacheProgress) => void,
  signal?: AbortSignal,
): Promise<PrecacheOutcome> {
  if (!precacheSupported()) {
    return { kind: 'unavailable', reason: 'insecure-context' };
  }

  let manifest: Manifest;
  try {
    let polls = 0;
    for (;;) {
      manifest = await fetchManifest(examId);
      if (manifest.ready) break;
      onProgress({ completed: 0, total: 0, serverReady: false });
      polls += 1;
      if (polls > MAX_NOT_READY_POLLS) {
        return { kind: 'failed', error: new Error('The exam materials are still being prepared.') };
      }
      // Jittered, so a lab polling together spreads out (B21).
      const wait = (manifest.retryAfterSeconds ?? 5) * 1000 * (1 + 0.3 * Math.random());
      await sleep(wait, signal);
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ApiError && (error.httpStatus === 404 || error.httpStatus === 403)) {
      return { kind: 'unavailable', reason: 'not-participant' };
    }
    return { kind: 'failed', error };
  }

  const cache = await caches.open(ENCRYPTED_CACHE_NAME);
  // Signed ciphertext URLs live 15 minutes, and a lab on a congested 2 Mbit
  // link needs about that long for a media-heavy paper (F20 lab burst: 52
  // of 1,600 downloads hit an expired URL). Near expiry, or on a 403, every
  // worker shares one manifest re-fetch for fresh URLs and carries on;
  // assets already cached are not downloaded again.
  const signed = new Map(manifest.assets.map((a) => [a.mediaAssetId, a]));
  let refreshes = 0;
  let refreshing: Promise<void> | null = null;
  const refreshUrls = (): Promise<void> => {
    if (refreshes >= MAX_URL_REFRESHES) return Promise.resolve();
    refreshing ??= fetchManifest(examId)
      .then((fresh) => {
        refreshes += 1;
        for (const a of fresh.assets) signed.set(a.mediaAssetId, a);
      })
      .catch(() => undefined)
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };
  const urlFor = async (mediaAssetId: string): Promise<string | undefined> => {
    const current = signed.get(mediaAssetId);
    if (current && Date.parse(current.expiresAt) - Date.now() < URL_REFRESH_MARGIN_MS) {
      await refreshUrls();
    }
    return signed.get(mediaAssetId)?.url;
  };
  const queue = [...manifest.assets];
  const total = queue.length;
  let completed = 0;
  let failure: unknown = null;
  onProgress({ completed, total, serverReady: true });

  const worker = async () => {
    for (;;) {
      const asset = queue.shift();
      if (!asset || failure) return;
      const key = encryptedCacheKey(examId, asset.mediaAssetId);
      const existing = await cache.match(key);
      if (existing && existing.headers.get('x-atlas-sha256') === asset.sha256) {
        completed += 1;
        onProgress({ completed, total, serverReady: true });
        continue;
      }
      let stored = false;
      for (let attempt = 0; attempt <= MAX_RETRIES_PER_ASSET && !stored; attempt += 1) {
        try {
          const url = await urlFor(asset.mediaAssetId);
          if (!url) break;
          const response = await fetch(url, signal ? { signal } : {});
          if (response.status === 403 && refreshes < MAX_URL_REFRESHES) {
            // Expired signature: re-sign and try again without spending a retry.
            await refreshUrls();
            attempt -= 1;
            continue;
          }
          if (!response.ok) continue;
          const body = await response.arrayBuffer();
          if ((await sha256Hex(body)) !== asset.sha256) continue; // corrupted in transit
          await cache.put(
            key,
            new Response(body, {
              headers: {
                'content-type': 'application/octet-stream',
                'x-atlas-sha256': asset.sha256,
              },
            }),
          );
          stored = true;
        } catch (error) {
          if (signal?.aborted) throw error;
        }
      }
      if (!stored) {
        failure = new Error('Some exam materials could not be downloaded.');
        return;
      }
      completed += 1;
      onProgress({ completed, total, serverReady: true });
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, total || 1) }, worker));
  if (failure) return { kind: 'failed', error: failure };
  return { kind: 'ready', assetCount: total, totalBytes: manifest.totalBytes };
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * At Start: decrypts every pre-cached asset this attempt references into
 * the ordinary F13 media cache, marks the attempt's manifest rows cached,
 * then deletes the ciphertext. Returns how many assets were decrypted; an
 * asset with no ciphertext (or one that fails authentication) is simply
 * left `pending` for the F13 download gate to fetch — never a hard failure.
 */
export async function decryptPrecachedMedia(
  examId: string,
  attemptId: string,
  mediaKeyBase64: string | null | undefined,
): Promise<number> {
  if (!mediaKeyBase64 || !precacheSupported()) return 0;
  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(mediaKeyBase64),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const encrypted = await caches.open(ENCRYPTED_CACHE_NAME);
  const plain = await caches.open(MEDIA_CACHE_NAME);
  const db = getAttemptDb();
  const rows = await db.mediaManifest.where('attemptId').equals(attemptId).toArray();

  let decrypted = 0;
  for (const row of rows) {
    const ciphertext = await encrypted.match(encryptedCacheKey(examId, row.mediaAssetId));
    if (!ciphertext) continue;
    try {
      const blob = new Uint8Array(await ciphertext.arrayBuffer());
      const bytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: blob.subarray(0, 12) },
        key,
        blob.subarray(12),
      );
      await plain.put(
        mediaCacheKey(row.mediaAssetId),
        new Response(bytes, {
          headers: { 'content-type': row.mediaType || 'application/octet-stream' },
        }),
      );
      await db.mediaManifest.update([attemptId, row.mediaAssetId], {
        cacheStatus: 'cached',
        cachedAt: new Date().toISOString(),
      });
      await encrypted.delete(encryptedCacheKey(examId, row.mediaAssetId));
      decrypted += 1;
    } catch {
      // Authentication failure (wrong key / corrupted entry): leave the row
      // pending; the F13 gate downloads it directly.
      await encrypted.delete(encryptedCacheKey(examId, row.mediaAssetId));
    }
  }
  return decrypted;
}

/** Removes any ciphertext left for an exam (e.g. after finalisation). */
export async function clearPrecachedMedia(examId: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  const encrypted = await caches.open(ENCRYPTED_CACHE_NAME);
  const prefix = `https://atlas-exam-media.invalid/enc/${examId}/`;
  for (const request of await encrypted.keys()) {
    if (request.url.startsWith(prefix)) await encrypted.delete(request);
  }
}
