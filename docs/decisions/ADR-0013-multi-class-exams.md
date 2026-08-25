# ADR-0013 — Exams may target multiple classes

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** M-03 (HIGH), D-03 (HIGH)
**Blocks phases:** B11

## Context

`07 §8.1` gives `Exam` a single `class_id`, and `03 §83`'s worked example creates _"SS2A Mathematics First Term Examination"_ for one arm.

A school with SS2A, SS2B and SS2C sitting the same Mathematics paper would therefore create three exam records with identical questions. That fragments SS2-level reporting, triples the readiness checks, and gives the teacher three Control Center screens to run during one sitting.

It also sits oddly beside the platform's own strongest design decision: `06 §73` and `06 §79` argue at length that one exam must serve multiple **batches** rather than fragmenting into `Batch 1` / `Batch 2` exams. The same argument applies to arms of the same level.

## Decision

**An exam may target one or more classes, through an `ExamClass` join.**

- `Exam.class_id` is replaced by `ExamClass` (exam × class).
- All targeted classes must belong to the same school, session and — given [ADR-0001](./ADR-0001-academic-scope-model.md) — the same level, since the exam's questions are level-scoped.
- Eligibility resolves through **any** targeted class, combined with subject registration per [ADR-0011](./ADR-0011-student-subject-registration.md).
- Results, participation and analytics aggregate across the whole exam, with per-class breakdown available.
- Teacher authorization requires an active assignment covering **at least one** targeted class; the Control Center shows all targeted classes.

## Consequences

**Easier**

- One exam record for one paper, however many arms sit it.
- SS2-level reporting works without stitching three exams together.
- One Control Center for the whole sitting, consistent with the batch model.

**Harder**

- Every scope check that assumed a single class must handle a set.
- Teacher authorization needs a rule for partial coverage — a teacher assigned only SS2A operating an exam that also targets SS2B and SS2C. Resolved as: assignment to any targeted class grants operation of the exam, since `ExamAdministrator` delegation (`M-15`) already permits cross-teacher administration.
- Analytics must offer both whole-exam and per-class views.

**Required changes**

- B11: `ExamClass` join; validation that targeted classes share school, session and level; readiness checks across all targeted classes.
- B12: eligibility and the Control Center span all targeted classes.
- B15/B17: results and analytics aggregate across the exam with per-class breakdown.
- F11: multi-class selection in the exam builder.
- F12: per-class grouping in the live attempt table.
