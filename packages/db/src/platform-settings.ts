import {
  resolvePlatformSettings,
  type PlatformSettingsEnv,
  type ResolvedPlatformSettings,
} from '@atlas/config';
import type { PrismaClient } from './client.js';

const DEFAULT_TTL_MS = 30_000;

export interface PlatformSettingsReader {
  /** The settings in effect, at most `ttlMs` old. Never throws: if the
   * table can't be read, the env values apply (ADR-0036). */
  get(): Promise<ResolvedPlatformSettings>;
  /** Drops the cache, so this process sees a change at once. */
  invalidate(): void;
}

/**
 * ADR-0036: one per process (API, worker). Reads `platform_settings`, lays
 * the stored overrides over the env defaults, and caches the result for 30
 * seconds, so a change made in the console reaches every process without a
 * restart and sign-in never waits on more than one small query a minute.
 */
export function createPlatformSettingsReader(
  client: Pick<PrismaClient, 'platformSetting'>,
  env: PlatformSettingsEnv,
  options: { ttlMs?: number; onError?: (error: unknown) => void } = {},
): PlatformSettingsReader {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  let cached: { at: number; value: ResolvedPlatformSettings } | null = null;
  let inflight: Promise<ResolvedPlatformSettings> | null = null;

  async function load(): Promise<ResolvedPlatformSettings> {
    try {
      const rows = await client.platformSetting.findMany({ select: { key: true, value: true } });
      return resolvePlatformSettings(env, rows);
    } catch (error) {
      options.onError?.(error);
      // Cached like a normal read, so a failing database is retried once
      // per TTL rather than on every sign-in.
      return resolvePlatformSettings(env, []);
    }
  }

  return {
    async get() {
      if (cached && Date.now() - cached.at < ttlMs) return cached.value;
      inflight ??= load().then((value) => {
        cached = { at: Date.now(), value };
        inflight = null;
        return value;
      });
      return inflight;
    },
    invalidate() {
      cached = null;
    },
  };
}
