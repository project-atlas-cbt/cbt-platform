# ADR-0002 — Question pools deferred; fixed selection in the initial release

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** C-09 (BLOCKER), X-06 (BLOCKER)
**Blocks phases:** B11, B13, B17

## Context

The specifications contradict each other on this.

`05 §21`, headed _"Question Pool / Random Selection"_, states: _"**Production scope should support both**: Fixed exam — teacher explicitly selects questions. Question pool — teacher configures Topic: Algebra, Difficulty: Mixed, **Pool size: 30, Questions shown: 10**."_

The canonical model has no pool. `07 §8.3` binds `ExamQuestion` to one approved revision with a sequence and marks; `07 §24` builds the attempt snapshot by iterating `ExamQuestion`. `04 §42` shows the builder as a checkbox list and explicitly labels "Generate from question pool" as _"future functionality."_

Pools mean **different students receive different questions**, which is not a presentation concern like option-order randomisation. It invalidates several things the rest of the corpus assumes: snapshot construction (`07 §24`), question analytics denominators (`05 §52`), provable equality of `total_marks` across attempts (`07 §10.1`), and the readiness checklist (`05 §23`).

## Decision

**Fixed selection only for the initial release. Question pools are an approved deferral.**

- Every student sits the same question set.
- Per-attempt randomisation of **question order** and **option order** remains fully in scope (`06 §52`–`§53`) — the anti-cheating benefit that matters most is retained.
- Pools are recorded as a deferred feature, not a removed one, and must not be implemented opportunistically (`AGENTS.md §14`).
- **No speculative pool schema is added.** The third option considered — a nullable pool reference carried from day one — was rejected: unused schema tends to constrain later design more than it helps, and adding `ExamQuestionPool` when the feature is genuinely specified is a clean additive migration.

## Consequences

**Easier**

- B13's start transaction stays simple: validate, create attempt, snapshot from `ExamQuestion`, commit.
- Question analytics keeps equal denominators, so `04 §50`'s "Q3: 37% correct" comparison stays statistically valid.
- `total_marks` is trivially identical across attempts.
- B11 and B13 ship as scoped.

**Harder**

- Schools wanting per-student question variation cannot have it in this release; randomised order and options are the available mitigation.
- Adding pools later requires respecifying `07 §24`'s snapshot phase, an exposure-weighted analytics design, and a marks-equality guarantee.

**Required changes**

- B11: fixed selection only; no pool configuration surface.
- B13: snapshot iterates `ExamQuestion`.
- B17: question analytics assumes equal exposure.
- F11: no pool step in the builder.

## Revisiting

If pools are later approved, this ADR is superseded, and the following must be respecified before implementation: the start-attempt transaction, snapshot construction, marks-equality validation, readiness checks, and question analytics.
