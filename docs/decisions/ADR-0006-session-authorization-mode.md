# ADR-0006 — Session authorization mode

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** C-08 (BLOCKER), A-04 (BLOCKER)
**Blocks phases:** B12, B13, F12

## Context

The specifications describe two different products.

**Eligibility appears sufficient.** `03 §30`–`§31` and `05 §26`: when the teacher opens the exam, _"eligible students can see it"_, subject to a checklist of conditions.

**Explicit authorization appears mandatory.** `07 §22` Phase 3: _"For each student, `ExamSessionParticipant` is created or activated,"_ with the worked example _"40 students → 20 authorized → 20 waiting."_ `07 §13` makes `ExamSessionParticipant → Attempt` a `1:0..N` relationship, implying every attempt hangs off a participant record.

Under eligibility-only, `ExamSessionParticipant` is an optional gate used when the lab is too small. Under mandatory authorization, a teacher with 40 students and 40 computers must still name all 40 before anyone starts — which `03 §38`'s own narrative does not do, and which makes the common case worse.

`06 §43` hints at the resolution: the entity is _"particularly valuable for **explicit batch control** and makeup administration."_

## Decision

**An exam-level `access_mode` policy, with `ExamSessionParticipant` always written.**

- `access_mode = OPEN_TO_ELIGIBLE` (**default**) — opening a session authorises every currently eligible student, and the system writes participant rows for them automatically. The 40-students/40-computers case needs no extra teacher action.
- `access_mode = EXPLICIT_AUTHORIZATION` — no student may start until named, matching `07 §22` and the 40-students/20-computers case.
- **Participant rows are written in both modes**, never skipped. `07 §13`'s cardinality stays honest and the audit trail of who was allowed to sit, and when, is preserved either way.
- Eligibility is **one predicate**, used by both the student's visibility query and the start-attempt transaction, with the start path re-evaluating it under lock (resolves `A-04` and feeds `X-03`). The predicate: active account, correct school, active membership, current session, enrolled in a targeted class, registered for the subject ([ADR-0011](./ADR-0011-student-subject-registration.md)), exam open, session open, authorised participant, under attempt limit or holding an authorization ([ADR-0014](./ADR-0014-attempt-authorization.md)).

## Consequences

**Easier**

- Both documented workflows are supported without either being the awkward path.
- Batch control becomes an explicit choice rather than a hidden default.
- One eligibility predicate means visibility and start-time validation cannot drift apart — a common source of security bugs.

**Harder**

- Opening a session in `OPEN_TO_ELIGIBLE` mode writes potentially hundreds of participant rows in one transaction; must be sized in B21.
- Students enrolled **after** a session opens are not auto-authorised — the teacher must authorise them explicitly. This is the correct conservative behaviour but needs surfacing in F12.

**Required changes**

- B11: `access_mode` on the exam, defaulting to `OPEN_TO_ELIGIBLE`.
- B12: bulk participant creation on session open; the shared eligibility predicate.
- B13: start transaction re-evaluates the predicate under lock.
- F11: access-mode selection in exam rules, explained in plain language.
- F12: batch authorisation UI; surfacing of students not yet authorised.
