# Scaling and load-shedding runbook (B21)

**Status:** B21 (2026-10-03). Companion to [`capacity-plan.md`](./capacity-plan.md) (the numbers and
where they come from) and [`../operations/exam-health-monitor.md`](../operations/exam-health-monitor.md)
(the alerts that point here).

## What protects a live exam, in order

1. **The student's browser.** Every answer is written to IndexedDB first and flushed in batches
   (F13). A slow or refused API call delays confirmation; it never loses an answer, and per-question
   sequence numbers make the eventual replay safe (ADR-0007).
2. **Priority load shedding** (each API process, automatic). When a process's event-loop p99 stays
   above `LOAD_SHED_EVENT_LOOP_P99_MS` (default 200 ms) for 3 consecutive seconds, or more than
   `LOAD_SHED_MAX_IN_FLIGHT` (256) requests are in flight, it:
   - answers **reporting** (analytics, reports, exports, search, imports) with
     `503 SERVICE_UNAVAILABLE` + `Retry-After` for at least `LOAD_SHED_HOLD_MS` (30 s);
   - refuses **new** Control Center streams (the web client falls back to 5 s polling);
   - pauses its in-process export/import consumers;
   - sets the cluster signal `atlas:load:shed` (Redis, TTL = hold), so **every** API process sheds
     reporting and the **worker pauses non-critical queues** (analytics refresh, digests, orphan-media
     report, import expiry, subscription sweep, result adjustments, retention).
     At **twice** either threshold it also sheds standard admin traffic.
     **Never shed:** answer saves, heartbeats, events, start, resume, submit, status, sign-in, tenant
     resolution, health. Marking, the auto-submit sweeper, the Control Center refresh and the Exam
     Health Monitor keep running.
3. **Rate limits** (per session; per account+IP and per IP for sign-in) stop a runaway client, sized
   so a 40-student lab behind one NAT is never throttled (B20, re-validated in B21).

## Signals and what they mean

| Signal                                                | Where                                       | Meaning                                                   |
| ----------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| `Load shedding active …` (warn, `LoadMonitorService`) | API logs, with `eventLoopP99Ms`, `inFlight` | This process is saturated and is protecting the exam path |
| `atlas:load:shed` exists                              | Redis (`EXISTS atlas:load:shed`)            | At least one API process tripped in the last hold window  |
| `Load shedding: non-critical queues paused`           | worker logs                                 | Background work is yielding                               |
| `ANSWER_SAVE_SUCCESS_LOW`                             | Exam Health Monitor                         | Answers are failing — shedding alone did not hold         |
| `SUBMISSION_LATENCY_HIGH`, `MARKING_QUEUE_BACKLOG`    | Exam Health Monitor                         | Database or worker capacity                               |

## Responding to sustained shedding

Shedding is the system working as designed, but sustained shedding during an exam window means
capacity is short. In order:

1. **Do not restart the API or ask schools to restart exams.** Students' answers are safe in their
   browsers; a restart drops every in-flight request and every Control Center stream.
2. **Add API tasks** (ECS desired count). The API is stateless (`08 §6`); new tasks take traffic as
   soon as the ALB health check passes. Check the pool budget first: tasks × `DATABASE_POOL_MAX` +
   worker tasks × `DATABASE_POOL_MAX` must stay within the proxy's client limit (capacity plan §
   "Connection budget").
3. **If the database is the bottleneck** (commit latency / `WALWrite` waits, CPU), adding API tasks
   makes it worse. Scale the instance class (a reboot-free change on RDS only with Multi-AZ
   failover — plan it outside exam windows) and keep reporting shed.
4. **Defer reporting work explicitly:** exports and analytics are already paused while the signal is
   set; ask staff not to run bulk imports during exam windows.
5. After the window: confirm marking drained (`MARKING_QUEUE_BACKLOG` resolved) and results
   finalised, then record the event and the measurements against the capacity plan.

## Tuning

All thresholds are environment variables (no code change): `LOAD_SHED_ENABLED`,
`LOAD_SHED_EVENT_LOOP_P99_MS`, `LOAD_SHED_MAX_IN_FLIGHT`, `LOAD_SHED_HOLD_MS`,
`SSE_MAX_CONNECTIONS_PER_PROCESS`, `DATABASE_POOL_MAX`, `MARKING_CONCURRENCY`,
`ARGON2_MAX_CONCURRENCY`, `EXAM_CONTROL_REFRESH_INTERVAL_MS`, `EXAM_CONTROL_FULL_SCAN_INTERVAL_MS`.
Re-run the relevant `tools/load` scenario after any change and keep the result in
`docs/performance/results/`.

## Manual shed (drill or emergency)

`SET atlas:load:shed manual PX 600000` in Redis sheds reporting on every API process and pauses the
worker's non-critical queues for ten minutes; `DEL atlas:load:shed` ends it (each API process clears
within ~2 s, the worker within ~5 s). Use this to rehearse before a large exam day, or to clear
headroom during an incident.
