/**
 * B12: the Redis cache key, pub/sub channel name, and snapshot shape both
 * `apps/api` (`ExamControlCenterService`/`ExamControlStreamService`, the
 * readers/publishers-on-mutation) and `apps/worker`
 * (`exam-control-refresh.queue.ts`, the periodic sweep) need to agree on —
 * living here, not duplicated as a string literal in each app, mirroring
 * `platform/metrics-cache.ts`'s own B3 precedent exactly. The cache key and
 * the pub/sub channel name are deliberately the same string — Redis keeps
 * key-value storage and pub/sub channels in separate namespaces, so no
 * collision is possible; one function serves both purposes.
 */
import type { ExamSessionStatus, ExamSessionType, ExamStatus } from '../exams/constants.js';

export function examControlChannel(schoolId: string, examId: string): string {
  return `atlas:exam-control:${schoolId}:${examId}`;
}

/** TTL for the `examControlChannel` cache key (both the worker sweep's
 * periodic write and every mutation's own write-through use this). Bounds
 * how long a snapshot can survive once nothing is refreshing it any more —
 * the worker sweep only ever touches exams currently OPEN/CLOSED, so an
 * exam that moves to COMPLETED/CANCELLED/ARCHIVED would otherwise leave its
 * last cached snapshot in Redis forever with no writer left to correct or
 * expire it. Generous relative to the default refresh interval (a few
 * seconds) and the default staleness threshold (a few hours), so it never
 * expires a snapshot that's still being actively maintained. */
export const EXAM_CONTROL_CACHE_TTL_SECONDS = 6 * 60 * 60;

/** The Redis Stream key holding this exam's replay buffer for SSE
 * `Last-Event-ID` reconnection (R-04) — capped at ~1000 entries via
 * `XADD ... MAXLEN ~`, with a ~2-hour TTL refreshed on every append (safely
 * above the "connections up to an hour" figure R-04 itself names). */
export function examControlStreamKey(schoolId: string, examId: string): string {
  return `atlas:exam-control-stream:${schoolId}:${examId}`;
}

export interface ExamControlCenterSessionSnapshot {
  id: string;
  examId: string;
  sessionType: ExamSessionType;
  status: ExamSessionStatus;
  openedAt: string;
  openedByMembershipId: string;
  /** F12 gap closure: every sibling actor-facing DTO in this module already
   * resolves a display name (`Exam.createdByName`, `ExamAdministrator
   * .memberName`) — a raw membership id here would be the one regression
   * against that established convention. Resolved the same way, via a
   * batched `SchoolMembership` lookup (no schema/migration change; these
   * columns stay bare UUIDs by design, mirroring `Exam
   * .cancelledByMembershipId`'s own B11 precedent). */
  openedByName: string;
  closedAt: string | null;
  closedByMembershipId: string | null;
  closedByName: string | null;
  reopenedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExamControlCenterAggregateSnapshot {
  authorizedCount: number;
  notStartedCount: number;
  /** B13: `count(ExamAttempt.state = 'IN_PROGRESS')` for this exam. */
  inProgressCount: number;
  /** B13: `count(ExamAttempt.state IN ('SUBMITTED', 'AUTO_SUBMITTED'))`. */
  submittedCount: number;
  absentCount: number;
  attemptDataAvailable: boolean;
}

export interface ExamControlCenterStalenessSnapshot {
  isStale: boolean;
  openSince: string | null;
  thresholdMs: number;
}

/** Shared by `GET /v1/exams/:id/control`'s response and every SSE event
 * this exam's channel publishes. */
export interface ExamControlCenterSnapshot {
  examId: string;
  examStatus: ExamStatus;
  sessions: ExamControlCenterSessionSnapshot[];
  aggregate: ExamControlCenterAggregateSnapshot;
  /** B13: one row per currently-`IN_PROGRESS` `ExamAttempt` for this exam.
   * `studentName`/`startedAt` added post-B13 so the Control Center's live
   * attempt table can name rows and show a start time without a second
   * per-student join on the client. */
  liveAttempts: {
    studentProfileId: string;
    status: string;
    timeRemainingSeconds: number | null;
    studentName: string;
    startedAt: string;
  }[];
  staleness: ExamControlCenterStalenessSnapshot;
  computedAt: string;
}
