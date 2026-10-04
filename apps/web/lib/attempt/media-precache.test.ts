import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api';
import { getAttemptDb, clearAttemptData } from './db';
import { buildMediaManifestFromPackage } from './media-cache';
import { MEDIA_CACHE_NAME, mediaCacheKey } from './cache-keys';
import {
  ENCRYPTED_CACHE_NAME,
  decryptPrecachedMedia,
  encryptedCacheKey,
  precacheExamMedia,
} from './media-precache';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn() } };
});
const mockGet = vi.mocked(apiClient.GET);

/** A minimal in-memory CacheStorage — jsdom has none. */
class MemoryCache {
  readonly entries = new Map<string, Response>();
  match(key: string) {
    return Promise.resolve(this.entries.get(key)?.clone());
  }
  put(key: string, response: Response) {
    this.entries.set(key, response);
    return Promise.resolve();
  }
  delete(key: string | Request) {
    return Promise.resolve(this.entries.delete(typeof key === 'string' ? key : key.url));
  }
  keys() {
    return Promise.resolve([...this.entries.keys()].map((url) => new Request(url)));
  }
}
const stores = new Map<string, MemoryCache>();
const memoryCaches = {
  open: (name: string) => {
    if (!stores.has(name)) stores.set(name, new MemoryCache());
    return Promise.resolve(stores.get(name)!);
  },
};

const EXAM = 'exam-pre-1';
const ATTEMPT = 'attempt-pre-1';
const subtle = webcrypto.subtle;

async function sha256(bytes: Uint8Array): Promise<string> {
  return Buffer.from(await subtle.digest('SHA-256', bytes)).toString('hex');
}

async function encrypt(
  rawKey: Uint8Array<ArrayBuffer>,
  plain: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const body = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(12 + body.length);
  out.set(iv);
  out.set(body, 12);
  return out;
}

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function manifest(assets: { mediaAssetId: string; byteSize: number; sha256: string }[]) {
  return {
    ready: true,
    totalBytes: assets.reduce((n, a) => n + a.byteSize, 0),
    retryAfterSeconds: null,
    assets: assets.map((a) => ({ ...a, url: `https://media/${a.mediaAssetId}` })),
  };
}

async function seedManifestRow(mediaAssetId: string) {
  await buildMediaManifestFromPackage(ATTEMPT, [
    {
      examQuestionId: 'q1',
      media: [
        {
          mediaAssetId,
          displayOrder: 1,
          mediaType: 'image/png',
          url: `https://media/plain/${mediaAssetId}`,
          urlExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    },
  ]);
}

beforeEach(async () => {
  stores.clear();
  vi.stubGlobal('caches', memoryCaches);
  vi.stubGlobal('crypto', webcrypto);
  mockGet.mockReset();
  await clearAttemptData(ATTEMPT);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('precacheExamMedia (F20, ADR-0021 amendment)', () => {
  it('is unavailable without Cache Storage (insecure context) — Start falls back to the F13 gate', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await precacheExamMedia(EXAM, () => undefined)).toEqual({
      kind: 'unavailable',
      reason: 'insecure-context',
    });
  });

  it('waits for the server to finish encrypting, then caches verified ciphertext once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const blob = webcrypto.getRandomValues(new Uint8Array(64));
      const entry = { mediaAssetId: 'm1', byteSize: blob.length, sha256: await sha256(blob) };
      mockGet
        .mockReturnValueOnce(ok({ ready: false, totalBytes: 0, retryAfterSeconds: 1, assets: [] }))
        .mockReturnValueOnce(ok(manifest([entry])))
        .mockReturnValueOnce(ok(manifest([entry])));
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(blob)));
      vi.stubGlobal('fetch', fetchMock);
      const progress: unknown[] = [];

      const pending = precacheExamMedia(EXAM, (p) => progress.push(p));
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await pending).toEqual({ kind: 'ready', assetCount: 1, totalBytes: blob.length });
      expect(progress[0]).toEqual({ completed: 0, total: 0, serverReady: false });

      const cache = await memoryCaches.open(ENCRYPTED_CACHE_NAME);
      const cached = await cache.match(encryptedCacheKey(EXAM, 'm1'));
      expect(new Uint8Array(await cached!.arrayBuffer())).toEqual(blob);

      // A page reload does not download it again.
      await precacheExamMedia(EXAM, () => undefined);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a download whose hash does not match (corrupted in transit)', async () => {
    mockGet.mockReturnValue(
      ok(manifest([{ mediaAssetId: 'm1', byteSize: 3, sha256: '0'.repeat(64) }])),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response(new Uint8Array([9, 9, 9])))),
    );
    expect((await precacheExamMedia(EXAM, () => undefined)).kind).toBe('failed');
  });

  it('a non-participant (404) is "unavailable", not a failure', async () => {
    mockGet.mockReturnValue(
      Promise.resolve({
        error: { error: { code: 'NOT_FOUND', message: 'x', retryable: false, correlationId: 'c' } },
        response: new Response(null, { status: 404 }),
      } as never),
    );
    expect((await precacheExamMedia(EXAM, () => undefined)).kind).toBe('unavailable');
  });
});

describe('decryptPrecachedMedia', () => {
  it('decrypts with the Start key into the F13 cache, marks the row cached, drops ciphertext', async () => {
    const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
    const image = new TextEncoder().encode('diagram for question 3');
    const encrypted = await memoryCaches.open(ENCRYPTED_CACHE_NAME);
    await encrypted.put(encryptedCacheKey(EXAM, 'm1'), new Response(await encrypt(rawKey, image)));
    await seedManifestRow('m1');

    const count = await decryptPrecachedMedia(
      EXAM,
      ATTEMPT,
      Buffer.from(rawKey).toString('base64'),
    );

    expect(count).toBe(1);
    const plain = await (await memoryCaches.open(MEDIA_CACHE_NAME)).match(mediaCacheKey('m1'));
    expect(new TextDecoder().decode(await plain!.arrayBuffer())).toBe('diagram for question 3');
    expect((await getAttemptDb().mediaManifest.get([ATTEMPT, 'm1']))?.cacheStatus).toBe('cached');
    expect(await encrypted.match(encryptedCacheKey(EXAM, 'm1'))).toBeUndefined();
  });

  it('a wrong key never yields media — the row stays pending for the F13 gate', async () => {
    const encrypted = await memoryCaches.open(ENCRYPTED_CACHE_NAME);
    const blob = await encrypt(
      webcrypto.getRandomValues(new Uint8Array(32)),
      new Uint8Array([1, 2]),
    );
    await encrypted.put(encryptedCacheKey(EXAM, 'm1'), new Response(blob));
    await seedManifestRow('m1');
    const wrong = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64');

    expect(await decryptPrecachedMedia(EXAM, ATTEMPT, wrong)).toBe(0);
    expect((await getAttemptDb().mediaManifest.get([ATTEMPT, 'm1']))?.cacheStatus).toBe('pending');
  });

  it('no key (attempt not in progress) decrypts nothing', async () => {
    expect(await decryptPrecachedMedia(EXAM, ATTEMPT, null)).toBe(0);
  });
});

describe('clearAttemptData (F20 Security row)', () => {
  it('removes the attempt’s decrypted media from Cache Storage too', async () => {
    await seedManifestRow('m9');
    const plain = await memoryCaches.open(MEDIA_CACHE_NAME);
    await plain.put(mediaCacheKey('m9'), new Response('img'));
    await clearAttemptData(ATTEMPT);
    expect(await plain.match(mediaCacheKey('m9'))).toBeUndefined();
  });
});
