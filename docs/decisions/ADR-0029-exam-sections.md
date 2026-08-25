# ADR-0029 — Exam sections: schema present, UI deferred

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** A-12 (MEDIUM), A-15 (HIGH)
**Blocks phases:** B11, F11

## Context

`06 §36` argues that _"designing for sections gives us future flexibility"_, and `07 §8.2` models `ExamSection` with title, sequence, instructions and marks, noting _"A simple exam may have one implicit/default section."_

No screen in `04` shows section management, and no functional requirement in `05` describes creating one. "Implicit/default section" is doing a lot of work: does every exam get a real default section row, or is `exam_section_id` nullable on `ExamQuestion`?

`A-15` is entangled: **four** entities carry a `marks` value — `QuestionRevision`, `ExamQuestion`, `ExamSection`, and `AttemptQuestionSnapshot` — with no stated precedence.

## Decision

### Sections

- Model `ExamSection` per `07 §8.2`.
- **Always create one default section per exam**, so `ExamQuestion.exam_section_id` is **non-nullable** and adding multi-section authoring later needs no migration.
- **No section UI in the initial release** — the builder creates the default section invisibly.
- Multi-section authoring is an **approved deferral**.

### Marks precedence (resolving `A-15`)

- **`ExamQuestion.marks` is authoritative for the exam**, defaulting from `QuestionRevision.marks` at selection time. Reweighting is permitted while the exam is `DRAFT` and **locks at `READY`**.
- **`ExamSection.marks` is derived** — the sum of its questions — not stored. A stored section total that can disagree with its own children is a defect waiting to happen.
- **`AttemptQuestionSnapshot` carries `marks_snapshot`**, frozen at attempt start.
- **`Result.total_marks` is the sum of `marks_snapshot`** across the attempt's snapshots — correct even if the exam is later archived.

## Consequences

**Easier**

- No nullable foreign key on a hot table.
- Multi-section becomes purely additive.
- One unambiguous marks source per stage of the pipeline.

**Harder**

- A small amount of machinery ships unused, which is acceptable because it removes a future migration on a large table.
- Teachers can reweight an approved question for a specific exam. This slightly qualifies the "approved content is immutable" story — the _question_ is immutable, its _weighting within an exam_ is not. Worth stating in the B11 documentation so it is understood rather than discovered.

**Required changes**

- B11: default section always created; non-nullable `exam_section_id`; `ExamQuestion.marks` defaulted and locked at `READY`; `ExamSection.marks` derived or dropped.
- B13: `marks_snapshot` frozen at start.
- B15: `total_marks` summed from snapshots.
- F11: no section UI.
