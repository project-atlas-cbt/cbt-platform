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

## Amendment — 2026-10-06: the lock covers both axes

**Decided by:** Haneef (project owner), on a decision card in the result policy check.

`result_policy_locked` now fixes **both** axes, not only `result_policy`: while a school's policy is
locked, teachers and HODs can change neither who releases results nor what students see on their
own exams. School Admins and Moderators are not constrained. The settings screen's checkbox sits
under both settings and now says so.

While the lock is on, the **school's** two values are the effective values for every exam,
including exams created before the lock, so locking cannot be side-stepped by an exam's own copy.
Unlocking returns each exam to its own copy. One domain function,
`effectiveResultSettings` (`packages/domain/src/platform/result-policy.ts`), owns the rule and is
used everywhere it applies:

- **Configuration:** `PUT /exams/:id/configuration` refuses (403) a teacher's or HOD's change to
  either value while locked; resending the school's own values is accepted. `GET /exams/:id`
  returns the effective values and `resultSettingsLocked`.
- **Publication:** manual publish, unpublish, withhold and release check the effective release
  setting.
- **Automatic release:** the worker auto-publishes only when the effective release setting is
  `AUTOMATIC`. Before this amendment an exam set to `AUTOMATIC` by a teacher auto-published under
  a lock to `SCHOOL_ADMIN`.
- **Student visibility:** the student result detail uses the effective visibility.

Found in the same check: `GET /attempts/:id/status` returned marks and correct/incorrect counts to
the student as soon as marking finished, before any release and regardless of visibility. It now
returns only marking progress, and the submitted screen shows `04 §59`'s message instead.

## Amendment — 2026-10-08: full review shows the answer key

**Decided by:** Haneef (project owner), by instruction in the project thread.

`FULL_REVIEW` previously showed a student which questions were right or wrong, deliberately without
the options or the key (`04 §61` offers "question review"). It now shows, per question, **all
options, the correct option and the option the student chose**. Staff (result detail) see the same
for any student they may view.

- Student side: only through `GET /student/results/:id`, only after the result is released (the same
  `studentVisibleResultWhere` rule as before), and only when the effective visibility is
  `FULL_REVIEW`. Under `SCORE_ONLY` and `SCORE_AND_COUNTS` the response carries no per-question data
  at all (integration-tested on the serialised payload).
- The live attempt payload and the post-submit status still never carry the key (audit `X-05`).
- The key is read from the frozen attempt snapshot, so a later edit to the question bank does not
  change what a student or teacher sees.
- Unchanged: the result settings lock and already-finalised results. Visibility is evaluated on
  every read, so switching an exam (or the locked school value) to `FULL_REVIEW` applies at once to
  results already finalised and released; nothing is stored per result.
