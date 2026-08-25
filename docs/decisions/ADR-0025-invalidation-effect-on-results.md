# ADR-0025 — Effect of attempt invalidation on results

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** A-11 (HIGH), D-08 (HIGH), X-14 (HIGH)
**Blocks phases:** B15

## Context

`07 §13` and `07 §10.1` make `ExamAttempt → Result` strictly `1:1`, and _"a result cannot exist without an attempt."_ `07 §16` allows `IN_PROGRESS → INVALIDATED`. But `03 §76` and `05 §30` allow invalidation **after** the student has started — and by implication after submission and marking, since that is when a problem is usually discovered.

If a submitted, marked attempt is invalidated, its `Result` still exists. Nothing stated whether it is deleted (violating `07 §3.3` and invariant 11), transitioned to a state absent from the enum, or left `FINAL` and silently counted in class averages.

Separately, `X-14`: bulk adjustment across 1,200 results has no stated atomicity, failure behaviour, or idempotency.

## Decision

### `VOIDED` result state

- Reached only when the underlying attempt becomes `INVALIDATED` or `CANCELLED`.
- `VOIDED` results are **retained in full** — the 1:1 cardinality, the provenance invariant and the archival-not-deletion rule all hold simultaneously.
- Excluded from **every** aggregate and from student visibility.
- Visible to authorized staff **with the invalidation reason attached**.
- Analytics filters on result state through a **shared query layer**, so the exclusion is written once rather than repeated per query and forgotten in one.

### Result mutation and adjustment history

- `Result` holds **current** values; `ResultAdjustment` is the **append-only history**.
- Replaying adjustments in order must reproduce the original result — asserted by test, so `07 §38`'s "original finalized result" remains reconstructable.

### Bulk adjustment

- Modelled as a **single parent operation with per-result child records**.
- Processed **idempotently and resumably**; a worker crash mid-run resumes without partial application.
- The exam's results are held unpublished, or explicitly marked under adjustment, until the whole operation completes — so no partially-regraded cohort is ever visible.
- Each child writes its own audit event, so the adjustment is fully reconstructable.

## Consequences

**Easier**

- Invalidated work is retained as evidence without corrupting averages.
- A partially-applied adjustment cannot become visible.
- Every score change is reconstructable.

**Harder**

- Every analytics query must go through the shared filter; a direct query bypassing it is a defect. Worth a lint or review checklist item.
- Bulk adjustment needs progress tracking and resumability — meaningfully more work than a simple update.

**Required changes**

- B15: `VOIDED` state; shared result-state filter; parent/child bulk adjustment; resumable processing.
- B16: invalidation voids the result.
- B17: all aggregates exclude `VOIDED`.
- B15 testing: partial failure and re-run; adjustment replay reproduces the original.
- F15: voided results visibly distinguished with reason.
