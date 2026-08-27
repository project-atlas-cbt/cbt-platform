/**
 * B4's orphan-media reporting job: report only, never delete (cleanup
 * itself is `M-14`'s future retention-policy job). The Redis key +
 * snapshot shape both `apps/api` (the reader, `GET /v1/platform/media/
 * orphan-report`) and `apps/worker` (the sweeper, the writer) need to
 * agree on — living here, same convention as `platform/metrics-cache.ts`,
 * so the two processes can never drift on the key name or field set.
 *
 * `uncheckedReadyCount` exists specifically so this report never silently
 * overstates its own coverage: `READY` question-media assets (type
 * QUESTION_IMAGE/QUESTION_DIAGRAM/OTHER) have nothing that references them
 * yet — `Question`/`QuestionMedia` don't exist until B8 — so classifying
 * them as orphaned would flag every single one, which is noise, not
 * signal. They're counted here, honestly, as "not yet checkable," not
 * classified as orphaned and not silently excluded from the snapshot.
 */
export const ORPHAN_MEDIA_REPORT_CACHE_KEY = 'atlas:media:orphan-report:snapshot';

export interface OrphanMediaReportSnapshot {
  /** status = PENDING, uploadUrlExpiresAt in the past — upload requested, never completed. */
  expiredPendingCount: number;
  /** status = READY, type = SCHOOL_LOGO, no School.logoMediaId points to it anymore. */
  supersededLogoCount: number;
  /** READY, non-SCHOOL_LOGO assets — real reference-checking is B8's job (see doc comment above). */
  uncheckedReadyCount: number;
  computedAt: string;
}
