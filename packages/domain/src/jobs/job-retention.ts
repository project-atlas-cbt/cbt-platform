/**
 * B22 (08 §25 "worker crash" / "result worker failure"): how long a job
 * that failed every retry stays in Redis, so an operator can see why and
 * replay it (`ops:replay-jobs`) rather than the work being silently lost.
 *
 * 14 days covers a failure noticed after a weekend or a school holiday
 * week. The count cap bounds Redis memory if something fails at volume
 * (a whole exam's marking during an outage is ~a few thousand jobs).
 *
 * Applies to jobs that carry one piece of work (marking, import, export,
 * notification, adjustment, media pre-cache). Scheduled sweeps keep their
 * short failure history: the next tick re-runs the sweep anyway, so a
 * failed tick has nothing to replay.
 */
export const FAILED_JOB_RETENTION = {
  age: 14 * 24 * 3600,
  count: 10_000,
} as const;
