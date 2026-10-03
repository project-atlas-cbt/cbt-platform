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

/**
 * B21 (R-04): the pub/sub message carries the replay-stream entry id with
 * the snapshot, so live SSE frames get an `id:` and a reconnect's
 * `Last-Event-ID` resumes from the right point. Format: `<id>\n<json>`
 * (`JSON.stringify` never emits a raw newline). A message with no newline
 * is a bare snapshot from a pre-B21 publisher — still delivered, without id.
 */
export function encodeExamControlEvent(id: string, payload: string): string {
  return `${id}\n${payload}`;
}

export function decodeExamControlEvent(message: string): { id?: string; payload: string } {
  const newline = message.indexOf('\n');
  if (newline <= 0) return { payload: message };
  return { id: message.slice(0, newline), payload: message.slice(newline + 1) };
}

/**
 * B21 (R-12): the cluster-wide load-shedding signal. Any API process that
 * trips its saturation threshold sets this key (with a TTL equal to its
 * hold time); every API process sheds reporting while it exists, and the
 * worker pauses its non-critical queues — so background work never starves
 * the interactive exam path.
 */
export const LOAD_SHED_SIGNAL_KEY = 'atlas:load:shed';

/**
 * B21: exams with live activity, as `<schoolId>:<examId>` members. The API
 * adds an exam on every attempt start/submit/auto-submit; the worker's
 * Control Center refresh sweep re-computes these every tick (time remaining
 * changes continuously) and drops an exam once it has no attempt in
 * progress. The full every-school scan — needed only for staleness
 * detection — then runs at a much slower cadence, so the sweep's cost
 * follows exam *activity*, not the number of schools and open exams
 * (measured: 500 schools / 455 open exams ≈ 700 transactions/s at a 5 s
 * full-scan cadence).
 */
export const EXAM_CONTROL_ACTIVE_SET_KEY = 'atlas:exam-control:active';
