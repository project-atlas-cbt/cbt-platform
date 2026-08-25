# ADR-0024 — Participation records and roll-up across sessions

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** A-05 (HIGH), D-07 (HIGH)
**Blocks phases:** B16

## Context

`07 §9.5` gives `ExamParticipation` both an `exam_id` and an `exam_session_id`, and declares it _"the authoritative participation record."_ `07 §33` describes an absent student getting `ABSENT` at session close, then later a makeup attempt — while _"the original absence remains."_

It was not stated whether a student has **one** participation record per exam or **one per session**. Per exam, the makeup must mutate the `ABSENT` row, contradicting `07 §42` invariant 10. Per session, a student absent in Session 1 and present in the makeup has two rows, and nothing says how to answer "was this student absent?" on the exam report — naive counting double-counts.

Separately, participation state exists in **three** places: `ExamAttempt.participation_status`, the `ExamParticipation` entity, and `ExamSessionParticipant.status` (whose values include `COMPLETED`).

## Decision

### One participation record per (exam, session, student)

History is preserved per `07 §33`; nothing is mutated by a makeup.

### A documented exam-level roll-up rule

A student's exam-level participation is:

1. **`ATTENDED`** if any session produced a non-invalidated attempt;
2. otherwise **`ABSENT`** if any session recorded absence;
3. otherwise **`PENDING`**.

Reports must state which view they present. The makeup case must show **both** facts — `Original: Absent / Makeup: Completed` — exactly as `03 §43` requires.

### Three fields reduced to one authority

- **`ExamParticipation`** is the single authority (per `07 §9.5`).
- **`ExamAttempt.participation_status`** is removed as an independently writable field — it becomes a projection or is dropped. It was a denormalised copy that could drift.
- **`ExamSessionParticipant.status`** describes **authorization only**: `AUTHORIZED`, `REVOKED`. `COMPLETED` is dropped from that enum — it duplicated attempt state.

## Consequences

**Easier**

- No double-counting in Control Center summaries or participation exports.
- Makeup history is preserved without mutation.
- One field to read, so participation cannot self-contradict.

**Harder**

- Every participation query must apply the roll-up rather than counting rows.
- Reports must be explicit about session-level versus exam-level views, which is a UI clarity requirement, not just a data one.

**Required changes**

- B16: per-session records; roll-up as a shared function; `participation_status` removed; `ExamSessionParticipant.status` reduced.
- B12: Control Center counts use the roll-up.
- B18: exports state which view they present and preserve `ABSENT` (`05 §54`).
- F16: both original and makeup outcomes visible.
