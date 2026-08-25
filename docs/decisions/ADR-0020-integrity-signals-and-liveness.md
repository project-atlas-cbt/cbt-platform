# ADR-0020 — Integrity signals and attempt liveness

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** M-08 (HIGH), M-09 (HIGH), X-09 (MEDIUM)
**Blocks phases:** B12, B13

## Context

Two related gaps.

**Integrity signals.** `03 §78` specifies an anti-cheating foundation for the core product: fullscreen mode where supported, tab and window-change monitoring, warning events, administrative visibility, and audit trail — with the caveat that these are _"controls, not evidence of cheating by themselves."_ `05 §73` requires the Control Center to surface _"1 student has experienced repeated exam-window exits."_ No entity models these events. Routing thousands of per-attempt focus events into `AuditEvent` would swamp a table meant for school-administrative actions.

**Liveness.** `05 §73` requires a _"2 students are disconnected"_ warning and `04 §46` shows a per-student status column. But `ExamAttempt` records only `started_at`, `expires_at` and `submitted_at` — an abandoned attempt is indistinguishable from one being worked on quietly. This also underpins [ADR-0004](./ADR-0004-auto-submission-ownership.md).

## Decision

### `AttemptEvent`

- Keyed on attempt, with type, `occurred_at`, and client-reported metadata.
- Types: `WINDOW_BLUR`, `FULLSCREEN_EXIT`, `TAB_HIDDEN`, `RECONNECTED`, `RESUMED`.
- Written **off the critical path** — never blocking or delaying an answer save.
- Explicitly labelled **client-reported and therefore untrusted**.
- Surfaced in the Control Center as **counts, not judgements**, per `03 §78` and `08 §17`. The system never labels a student as cheating.
- Retained with the attempt.

### Liveness

- `last_seen_at` on the attempt, updated by answer saves and by a lightweight heartbeat while the attempt is open.
- "Disconnected" is derived as `last_seen_at` older than a threshold.
- **The heartbeat must not update the parent `ExamAttempt` row on every answer save** — per `R-03`, answer writes must touch only `AttemptAnswer` to avoid lock contention on the hot path. `last_seen_at` is therefore maintained on a separate lightweight path.
- Heartbeat interval sized against B21 results, since it multiplies by concurrent attempts.

## Consequences

**Easier**

- `05 §73`'s operational alerts become implementable.
- The teacher's batch-release decision is made on real information (`X-09`).
- The audit table stays clean.

**Harder**

- Heartbeats add sustained write volume proportional to concurrent attempts — a real cost that B21 must size.
- Client-reported events invite over-interpretation; the UI must present them neutrally, and this should be reinforced in the invigilator documentation (F21).

**Required changes**

- B12: `last_seen_at`-derived disconnected indicator; event counts in the Control Center.
- B13: `AttemptEvent` table; heartbeat endpoint; off-critical-path writes.
- B21: size the heartbeat interval.
- F12: neutral presentation of signal counts.
- F13: emit events and heartbeats without blocking answering.
