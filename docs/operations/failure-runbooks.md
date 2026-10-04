# Failure runbooks — B22

**Status:** B22 (2026-10-04). One runbook per failure mode in `08 §25`, plus Redis data loss. Each
says how the failure shows itself, what the platform already does about it (proved by an induced
failure — [chaos-testing.md](chaos-testing.md)), and what a person does. Restores:
[backup-and-restore.md](backup-and-restore.md). Load and shedding:
[../performance/scaling-runbook.md](../performance/scaling-runbook.md). Alerts:
[exam-health-monitor.md](exam-health-monitor.md).

**DoD 9 is partial:** these runbooks have not yet been followed by someone who did not write them.
That happens on staging in B23; until then they are drafts that the chaos runs and the drill
exercise, not a person.

## 0. During any incident with exams running — tell the invigilators first

Read this to every invigilator in an affected lab, before anything else:

> Students keep answering. Their answers are saved on the computer and are sent when the connection
> comes back — they will see a "You're offline" or "Reconnecting" notice, which is expected.
> **Do not let anyone reload the page, close the browser or restart the computer.** Leave every exam
> page open until we say the incident is over, even after time runs out. If a student sees "Your
> assessment could not be found on the server", their answers are still on that computer: leave the
> page open and note the computer and the student.

Why: an open page re-sends everything the server does not have when it reconnects, including after a
database rollback (decision 2c). A reload also recovers unsent answers from the computer, but it is
the step most likely to go wrong in a lab (a student signs in on another computer, the cache is
cleared), so it is avoided.

Signals common to all dependency failures:

- `GET /v1/health/ready` on each API process — `503` only when the database is unreachable or the
  process is draining; Redis and object storage show as `degraded` while the process keeps serving.
- Log lines from `DependencyHealth`: `<dependency> unavailable — degraded mode` (once),
  `<dependency> still unavailable` (every 30 s), `<dependency> recovered` (with the duration).
- Metrics: `atlas.dependency.fallback{dependency,component}` per fallback;
  `atlas.work.reconciled{kind,outcome}` when the worker re-queues owed work.

## 1. Temporary network loss (a lab, a school, a student)

- **Shows as:** the Exam Health Monitor's `ANSWER_SAVE_SUCCESS_LOW` for one school; students see
  "You're offline".
- **Platform does:** answers go to IndexedDB first and are flushed in order when the network returns
  (ADR-0007 sequence numbers make the replay safe); the timer is the server's, so the student loses
  no time to the client. On reconnect the client checks the attempt with the server and re-sends
  anything it no longer has.
- **You do:** §0 for the lab. If the attempt's time runs out during the outage, answers that reach
  the server within the 60 s grace window count; later ones are kept as evidence only (ADR-0003).
  A student who lost time to a long outage is the school's call: a makeup or an exceptional
  reattempt (ADR-0014).
- **Proved by:** F20 `network.spec.ts` (full disconnect, lossy 3G); B22 `recovery.spec.ts`
  (reload with unsent answers); `sync-engine.rollback.test.ts`.

## 2. Database transient failure (connections dropped, restart, failover)

- **Shows as:** `5xx` spike; readiness `503` (`database` failed) for the duration; RDS event
  **(B23)**.
- **Platform does:** each request is one transaction, so a dropped connection rolls it back and the
  client retries (answer saves, starts and submits are idempotent — never a second attempt or
  result). The pool reconnects by itself.
- **You do:** nothing while it lasts under a minute; §0 if it lasts longer. After: check
  `ops:restore-verify` passes on the live database (read-only) if the failure was not a clean
  failover.
- **Proved by:** chaos `pg-terminate` (every application connection killed twice mid-exam),
  `pg-restart` (Postgres restarted mid-exam).

## 3. Worker crash

- **Shows as:** `MARKING_QUEUE_BACKLOG`; the worker task restarting **(B23 ECS)**.
- **Platform does:** BullMQ hands a job whose worker died to the next worker (marking may stall
  five times before it fails — it is idempotent). An exam whose time runs out while the worker is
  down is finalised by the auto-submit sweeper when the worker returns, and its marking follows.
  Results are only ever resolved once (ADR-0018): a duplicate marking job for a FINAL result is a
  no-op.
- **You do:** make sure a worker is running. If jobs failed every retry, the worker's reconciliation
  re-queues marking and adjustments (three times); then use `ops:replay-jobs` (backup-and-restore.md
  §6).
- **Proved by:** chaos `worker-kill9` (killed twice while marking drained), `worker-kill-expiry`
  (down across an exam's expiry and grace).

## 4. Client crash (browser closed, computer restarted, page reloaded)

- **Shows as:** the student's heartbeat stops (Exam Control Center).
- **Platform does:** the attempt stays `IN_PROGRESS` with its own server timer; signing back in and
  opening the exam resumes the same attempt with every answer the server has, and the answers still
  on that computer are sent on load. If the time runs out first, the sweeper submits it.
- **You do:** help the student sign in again **on the same computer** if possible (unsent answers
  live there). On another computer they resume with what the server holds.
- **Proved by:** `recovery.spec.ts` (reload with unsent answers: same attempt, nothing lost).

## 5. Application node crash

- **Shows as:** a task replaced **(B23 ECS)**; its in-flight requests fail.
- **Platform does:** nodes are stateless (sessions are in Postgres), so the load balancer's next
  node serves the retry. A node being stopped (deploy, scale-in) drains: readiness goes `draining`,
  open Control Center streams are closed so they reconnect elsewhere, and in-flight requests finish.
- **You do:** nothing if another node is healthy.
- **Proved by:** chaos `api-kill9` (SIGKILL), `api-term` (graceful drain), `api-hang` (a frozen
  node: requests wait and complete when it resumes).

## 6. Cache (Redis) outage

- **Shows as:** readiness `degraded` (`redis`); `redis unavailable — degraded mode` in every
  process; ElastiCache event **(B23)**.
- **Platform does** (decision 3): sign-in keeps working; brute-force lockout falls back to a
  per-process counter that is never looser than normal (each process locks after
  `floor(max / RATE_LIMIT_FALLBACK_PROCESSES)` failures); rate limiting and idempotency fall back
  the same way; calls stop waiting on Redis after one probe every 2 s (circuit breaker), so nothing
  hangs. Answers, starts and submits go to Postgres as always. Marking jobs that could not be queued
  are queued by the worker's reconciliation pass (about two minutes after the result was created,
  once Redis is back). Control Center live updates (Redis pub/sub) may pause; reloading the
  Control Center (staff only — never a student's exam page) reads current state from Postgres.
- **You do:** nothing for exams. Restore Redis. Watch `atlas.work.reconciled` for owed marking.
- **Proved by:** `redis-outage.integration.test.ts` (sign-in works and brute force is still blocked
  with Redis gone); chaos `redis-hang` (Redis frozen 45 s, every submission made during it).

## 7. Redis data loss (emptied, replaced, failed over without its data)

- **Shows as:** queues empty after a Redis event; results stuck `PROCESSING` for a few minutes.
- **Platform does:** the worker notices within 30 s that its job schedulers are gone and registers
  them again (they do not come back by themselves — B22 found this with the chaos run); its sweep
  then finds results still `PROCESSING` two minutes after they were created whose job is missing,
  and queues them again; the same for result adjustments. Nothing authoritative was in Redis.
- **You do:** nothing but watch `atlas.work.reconciled` and the worker log (`Job schedulers were
missing … registered them again`). Do not restore Redis from a backup — there is none, by design.
- **Proved by:** chaos `redis-data-loss` (Redis wiped with every marking job of a submit burst still
  queued); `job-reconcile.integration.test.ts`, `schedule-guard.integration.test.ts`.

## 8. Object storage outage

- **Shows as:** readiness `degraded` (`storage`); upload, export and pre-cache errors.
- **Platform does:** exams continue — media is cached on the computer before Start (ADR-0021) and
  the answer path never touches storage. Nothing file-dependent is marked successful when the file
  is not there: an upload completes only if the object really arrived (a late `complete` after a
  blip still succeeds), a failed pre-cache is retried on the next request, imports and exports keep
  their retry state and say "temporarily unavailable" when they give up.
- **You do:** nothing for running exams. A lab about to start whose pre-cache cannot finish cannot
  press Start (by design); move the start or wait. After recovery, `ops:replay-jobs` for failed
  exports/imports/pre-cache if users do not simply retry.
- **Proved by:** chaos `storage-hang` (storage frozen 30 s mid-exam); `media.integration.test.ts`,
  `exam-media-precache-queue.service.test.ts`, the import/export retry tests.

## 9. Result worker failure (marking fails, not the process)

- **Shows as:** results stay `PROCESSING`; failed jobs in `atlas-attempt-marking`.
- **Platform does:** the attempt stays finalised (the transition and its audit are committed before
  marking is queued); marking is one transaction per attempt, so a failed run leaves nothing
  partial; BullMQ retries; the reconciliation pass re-queues an exhausted job up to three times.
- **You do:** find the cause in the worker log (job id `mark-<attemptId>`), fix it, then
  `ops:replay-jobs --queue atlas-attempt-marking --apply`.
- **Proved by:** the B14/B22 marking tests (mid-run crash rolls back; replay after a grading-scale
  change keeps the original grade); chaos `worker-kill9`.

## 10. Data damaged — restore needed

Follow [backup-and-restore.md](backup-and-restore.md) §2–§4, starting with §0 above.
