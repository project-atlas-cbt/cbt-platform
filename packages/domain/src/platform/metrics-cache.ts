/**
 * `05 §75`/roadmap: "Platform metric aggregation (derived, cached — never
 * authoritative)." The Redis key + snapshot shape both `apps/api`
 * (PlatformMetricsService, the reader) and `apps/worker` (the sweeper, the
 * writer) need to agree on — living here (not duplicated as a string
 * literal in each app) so the two processes can never drift on the key
 * name or the snapshot's field set. Neither app imports the other; both
 * already depend on `@atlas/domain`.
 */
export const PLATFORM_METRICS_CACHE_KEY = 'atlas:platform:metrics:snapshot';

export interface PlatformMetricsSnapshot {
  totalSchools: number;
  activeSchools: number;
  provisionalSchools: number;
  suspendedSchools: number;
  expiredSchools: number;
  deactivatedSchools: number;
  students: number;
  teachers: number;
  /** Always 0 until B11 — exams don't exist yet, never fabricated. */
  examsConducted: number;
  /** Always 0 until B13 — attempts don't exist yet, never fabricated. */
  attempts: number;
  computedAt: string;
}
