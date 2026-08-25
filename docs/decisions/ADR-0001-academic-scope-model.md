# ADR-0001 — Academic scope model: subject–department link and question level

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** C-04 (BLOCKER), M-01 (BLOCKER), D-02 (BLOCKER), A-16
**Blocks phases:** B5, B8, B9, B11

## Context

This was the audit's single most consequential open decision. Two authorization scopes are required in prose across four documents but **cannot be computed** from the canonical model.

**HOD review scope.** `01 §17`, `02 §2`, `03 §12` and `07 §41` all require an HOD to review only their department's subjects. But `06 §18` and `07 §6.5` give `Subject` the attributes school, name, code and status — **no `department_id`**. There is no path from `HODAssignment.department_id` to a set of questions, so `04 §29`'s review queue has no query behind it.

**Teacher question scope.** `01 §12`, `05 §15.3` and `05 §15.4` require questions scoped by subject **and** class, and `02 §1` states a Mathematics teacher assigned SS1A/SS1B must not reach SS3 questions. But `06 §25` and `07 §7.1` give `Question` only school, subject, author and status — **no class or level**. Without it, every Mathematics teacher reaches every Mathematics question, violating `07 §42` invariant 3.

`05 §23`'s readiness check ("all questions belong to valid scope") is likewise uncomputable.

## Options considered

**Subject → department:** one department per subject; many-to-many via a join; or dropping the link and assigning HODs to subjects directly.

**Question level:** scope to level (`SS2`); scope to class/arm (`SS2A`); or subject only with no level.

## Decision

### 1. `Subject.department_id` — one department per subject, nullable

HOD scope becomes a two-hop join with no new entity:

```text
HODAssignment.department_id → Subject.department_id → Question.subject_id
```

A subject with a null department falls outside every HOD's automatic review scope and requires explicit assignment. Many-to-many was rejected because two HODs reviewing one question needs a tie-break rule no specification defines.

### 2. `Question.level` — scoped to level, not arm

A question belongs to a level such as `SS2`, reusable across every arm of that level. Teacher scope validates as:

> the teacher holds an active `TeacherAssignment` to some `ClassSubject` whose `Subject` matches the question **and** whose `ClassGroup.level` matches the question's level.

Class/arm scoping was rejected because it defeats the reusable-question-bank premise in `06 §25` — a question written for SS2A could not serve SS2B, multiplying authoring effort by the number of arms.

### 3. `Topic` as a first-class entity

Resolving `A-16`, which `06 §31` explicitly deferred. `Topic` is scoped to (school, subject), with `subtopic` as a nullable self-reference. Imports resolve topic names case-insensitively and auto-create on first use, so `05 §18.1`'s template is unchanged. Free text was rejected because `04 §50` and `05 §52` both use topic as a reporting dimension, and "Quadratic Equations" / "quadratic equations" / "Quadratics" would fragment it.

## Consequences

**Easier**

- The HOD review queue, teacher question scope, and exam readiness validation all become computable.
- Question analytics by topic becomes trustworthy.
- No new entity is needed for HOD scope.

**Harder**

- A subject serving several departments needs an explicit choice of primary department, or an HOD assignment covering it.
- `ClassGroup.level` becomes load-bearing for authorization, so its values must be consistent within a school — level is now a controlled vocabulary, not free text.
- Topic management adds a small surface to B5 and F6.

**Required changes**

- B5: `Subject.department_id`; `Topic` entity; `ClassGroup.level` as a controlled vocabulary.
- B8: `Question.level`; teacher scope validation against subject **and** level; topic resolution on import.
- B9: HOD queue query via the two-hop join.
- B11: readiness check validates question scope against the exam's classes.
- F6/F9: department picker on subjects, level and topic pickers on questions.
