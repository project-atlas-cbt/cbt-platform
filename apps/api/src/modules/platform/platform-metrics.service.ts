import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  PLATFORM_METRICS_CACHE_KEY,
  ORPHAN_MEDIA_REPORT_CACHE_KEY,
  type PlatformMetricsSnapshot,
  type OrphanMediaReportSnapshot,
} from '@atlas/domain';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import type { PlatformMetricsResponseDto } from './dto/platform-metrics-response.dto.js';
import type { OrphanMediaReportResponseDto } from './dto/orphan-media-report-response.dto.js';

const EMPTY_METRICS: Omit<PlatformMetricsSnapshot, 'computedAt'> = {
  totalSchools: 0,
  activeSchools: 0,
  provisionalSchools: 0,
  suspendedSchools: 0,
  expiredSchools: 0,
  deactivatedSchools: 0,
  students: 0,
  teachers: 0,
  examsConducted: 0,
  attempts: 0,
};

const EMPTY_ORPHAN_REPORT: Omit<OrphanMediaReportSnapshot, 'computedAt'> = {
  expiredPendingCount: 0,
  supersededLogoCount: 0,
  uncheckedReadyCount: 0,
};

/**
 * `05 §75`/roadmap: "Platform metric aggregation (derived, cached — never
 * authoritative)." Reads the worker-computed snapshot from Redis (key/shape
 * shared via @atlas/domain's PLATFORM_METRICS_CACHE_KEY/PlatformMetricsSnapshot
 * — see that module's own doc comment) — never recomputes live, since a
 * true platform-wide student/teacher count would mean looping every
 * school's RLS-scoped tables one `withTenant` call at a time (a real
 * cross-tenant-aggregate constraint discovered while implementing B3, not
 * in the original plan text: `atlas_app`'s FORCE ROW LEVEL SECURITY means
 * there is no single global query for this). A missing snapshot (the
 * worker hasn't run yet) returns honest zeros with `computedAt: null`,
 * never a fabricated number.
 */
@Injectable()
export class PlatformMetricsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async read(): Promise<PlatformMetricsResponseDto> {
    const raw = await this.redis.get(PLATFORM_METRICS_CACHE_KEY);
    if (!raw) return { ...EMPTY_METRICS, computedAt: null };

    try {
      const parsed = JSON.parse(raw) as PlatformMetricsSnapshot;
      return parsed;
    } catch {
      return { ...EMPTY_METRICS, computedAt: null };
    }
  }

  /** B4's orphan-media report — same "worker-computed, Redis-cached,
   * honest zeros on a missing snapshot" convention as read() above. */
  async readOrphanMediaReport(): Promise<OrphanMediaReportResponseDto> {
    const raw = await this.redis.get(ORPHAN_MEDIA_REPORT_CACHE_KEY);
    if (!raw) return { ...EMPTY_ORPHAN_REPORT, computedAt: null };

    try {
      return JSON.parse(raw) as OrphanMediaReportSnapshot;
    } catch {
      return { ...EMPTY_ORPHAN_REPORT, computedAt: null };
    }
  }
}
