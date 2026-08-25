# ADR-0011 — Student subject registration

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** M-02 (BLOCKER), A-04
**Blocks phases:** B6, B11, B12

## Context

`03 §31` and `05 §26` both include _"Eligible for subject?"_ in the exam-eligibility check. But a student's relationship to subjects was only ever expressed through their class: `StudentEnrollment → ClassGroup`, with `ClassSubject` declaring which subjects a class is offered. `06 §19` states `ClassSubject` is _"the basis for teacher assignments and exam eligibility."_

That is sufficient only if **every student in a class takes every subject offered to it**. The project owner confirmed this does not hold: Nigerian senior secondary classes routinely include students taking Further Mathematics and students who do not, and trade or elective subjects may split a class.

Without a registration entity, an elective exam becomes visible to — and startable by — students who do not take that subject. They would then be marked `ABSENT` for a subject they never study, corrupting participation reporting and subject-level analytics.

## Decision

**Model `StudentSubjectRegistration`.**

- Keyed on (student enrollment, class subject) with a status.
- **Auto-registration**: enrolling a student in a class registers them for every active `ClassSubject` of that class. The common case requires no extra work from the Moderator.
- A Moderator can **deregister** a student from an elective, and re-register them.
- Exam eligibility checks **registration**, not class membership.
- Deregistration takes effect for future exams only; historical attempts and results are untouched (`07 §42` invariant 13).

## Consequences

**Easier**

- Elective subjects are administered correctly.
- Participation and subject analytics stop counting students who never took the subject.
- `03 §31`'s "eligible for subject" check becomes computable, resolving part of `A-04`.

**Harder**

- One more entity to maintain through enrollment, class movement, and session rollover.
- Class movement must reconcile registrations against the new class's offerings — the audit's recommendation is to auto-register for the new class's subjects and close registrations for subjects the new class does not offer, leaving historical records untouched.
- Session rollover ([ADR-0026](./ADR-0026-session-rollover-mechanics.md)) must carry registration forward or regenerate it.

**Required changes**

- B5: `ClassSubject` becomes the registration target.
- B6: `StudentSubjectRegistration`; auto-registration on enrollment; deregistration; class-movement reconciliation.
- B11: readiness check counts eligible **registered** students, not class members.
- B12: eligibility predicate checks registration.
- B19: rollover regenerates registrations for the new session.
- F7: elective management on the student profile and class roster.
