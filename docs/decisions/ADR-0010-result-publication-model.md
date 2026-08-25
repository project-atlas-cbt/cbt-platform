# ADR-0010 — Result publication model and granularity

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** C-05 (HIGH), A-09 (HIGH), C-12 (HIGH)
**Blocks phases:** B15

## Context

`07` models publication twice, in two places, with two lifecycles.

`07 §10.1` gives `Result` a `state` of `PROCESSING / FINAL / PUBLISHED / UNPUBLISHED / ADJUSTED` plus `published_at`. `07 §10.3` defines a separate `ResultPublication` entity with its own `published_by`, `published_at` and `PUBLISHED / UNPUBLISHED` status. `06 §59` explains the separate entity's purpose: it supports teacher, admin and automatic publication _"without changing the Result itself."_

The two designs are mutually exclusive. Keeping publication on `Result.state` conflates two orthogonal axes — marking lifecycle and visibility — so a result that is both `ADJUSTED` and `PUBLISHED` cannot be represented, and adjusting a published result would silently unpublish it.

Granularity was also unresolved: both documents say "Exam/result scope" without choosing, while every UI description (`04 §49`, `05 §48`) shows publication as a per-exam action.

## Decision

### Publication lives in `ResultPublication`, scoped per exam

- `ResultPublication` is the authority for visibility, one row per exam.
- Publish and unpublish are single-row operations.
- Individual withholding — a disputed result among 40 — is expressed as a **`withheld` flag on the result**, set through an audited action with a reason, rather than by fragmenting publication.

### `Result.state` covers the marking lifecycle only

```text
PROCESSING → FINAL → ADJUSTED
                  ↘ VOIDED
```

`VOIDED` comes from [ADR-0025](./ADR-0025-invalidation-effect-on-results.md). `PUBLISHED` and `UNPUBLISHED` are removed from this enum.

**Student visibility** = `Result.state ∈ {FINAL, ADJUSTED}` **and** an active `ResultPublication` for the exam **and** not `withheld`.

### Policy ownership (resolving `C-12`)

- `Exam.result_policy` is the effective value, seeded from the school default at exam creation.
- A school setting `result_policy_locked` determines whether teachers may change it.
- Two **separate** axes, since `01 §28`, `03 §50` and `05 §51` describe them independently:
  - `result_policy` — who releases: `TEACHER` / `SCHOOL_ADMIN` / `AUTOMATIC`.
  - `result_detail_visibility` — what the student sees: score only / score + counts / full question review.

## Consequences

**Easier**

- Marking and visibility evolve independently; an adjusted result can stay published.
- "Is this exam published?" is a single-row answer.
- `06 §59`'s stated rationale is preserved.

**Harder**

- Student result queries become a join across result, publication and withheld state — must be indexed carefully.
- Three conditions govern visibility, so a single shared helper must own the rule rather than it being re-implemented per query.

**Required changes**

- B15: `ResultPublication` per exam; reduced `Result.state`; `withheld` flag; shared visibility helper; both policy axes.
- B5/B3: school-level defaults and the lock flag.
- F5: policy configuration. F15: publication and withholding. F14: visibility honoured.
