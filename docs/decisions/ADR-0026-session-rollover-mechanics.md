# ADR-0026 — Session rollover mechanics

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** M-10 (MEDIUM), M-11 (MEDIUM)
**Blocks phases:** B19

## Context

`03 §60`–`§63` specifies the promotion workflow well: generate candidates, review exceptions, confirm. What is **not** specified is what rollover does to the academic structure.

`ClassGroup`, `ClassSubject` and `TeacherAssignment` are all session-scoped (`07 §6.4`, `§6.6`, `§6.8`), so a new session requires recreating the class structure, subject offerings and teacher assignments. `03 §64` acknowledges the teacher part — _"At the new session: Review teacher assignments"_ — but nothing says whether classes and offerings are copied forward, recreated manually, or selectively cloned.

For a school with 31 classes and 42 subjects (`04 §12`), manual recreation every August is a serious usability failure that would surface in year two of production — after the first customers have already renewed.

`M-11` adds: should teacher assignments carry forward (risking retained access) or start empty (87 teachers reassigned annually)?

## Decision

**Clone forward as reviewable drafts; nothing takes effect without confirmation.**

- A **session-rollover wizard** clones the previous session's `ClassGroup`, `ClassSubject` offerings, and teacher assignments into the new session as **editable draft records**.
- Promotion runs against the cloned structure.
- **Teacher assignments carry forward as _proposed_ drafts requiring explicit confirmation** — resolving `M-11` without choosing either bad default. The school neither reassigns 87 teachers from scratch nor silently retains stale access.
- Student subject registrations ([ADR-0011](./ADR-0011-student-subject-registration.md)) regenerate from the new session's offerings.
- Everything is reviewable before commit, per `03 §61`'s insistence that promotion is never an instant mass update.
- **Commit runs in one transaction** (`08 §7.3`). If a school proves large enough that a single transaction is impractical, a chunked-and-resumable strategy with a documented compensating path is required — but single-transaction is the default.
- Each promotion decision, including every override, emits its own audit event.

## Consequences

**Easier**

- Year-two onboarding is a review exercise, not a re-entry exercise.
- No silent retention of teacher access across sessions.
- Historical records are structurally untouched, since new session entities are new rows.

**Harder**

- The wizard is a substantial piece of work with large data volumes and a demanding review UI.
- Cloning must handle a previous session containing deactivated classes or subjects — resolved as: deactivated entities are not cloned.

**Required changes**

- B19: `RolloverPlan` and `RolloverDecision`; cloning; single-transaction commit; per-decision audit.
- B6: registrations regenerate for the new session.
- B19 testing: full before/after comparison proving no historical record changed; concurrent commits — exactly one succeeds.
- F19: reviewable plan; unmistakable commit confirmation; responsive at 1,000+ students.
