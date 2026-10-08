# ADR-0038 — Who sits a subject, which stream, and who vets it

**Status:** Accepted
**Date:** 2026-10-08
**Deciders:** Haneef (project owner)
**Audit findings:** none
**Amends:** [ADR-0001](./ADR-0001-academic-scope-model.md) (department meaning, review fallback),
[ADR-0011](./ADR-0011-student-subject-registration.md) (auto-registration)
**Affects phases:** B5, B6, B9, B11, B19, F6, F7, F10, F19

## Context

The pilot school raised two problems (2026-10-08). The design review is
`/mnt/project-files/departments-review/design.md`.

1. **Every student was registered for every subject their class offers.** ADR-0011 auto-registered
   an enrollment for every offering, and staff could only deregister one student and one subject at
   a time. An SS1 class offering thirteen subjects, where each student sits eight or nine, is
   unworkable that way. Rollover then registered every promoted student for every subject of the new
   class, so each year's electives had to be redone.
2. **Departments were doing two jobs.** The pilot set up Science, Business and Humanities, which are
   student streams, as departments. Mathematics and English belong to no stream, and because only an
   HOD may approve a question (`questionBank.approve`) and the HOD check needs the subject's
   department, a subject with no department could never get an approved question, so it could never
   have an exam. The same happens when a department's only HOD wrote the question, since nobody may
   approve their own.

Nigerian secondary schools separate three things: the **teaching department** a subject belongs to
(HOD Mathematics, HOD English, across JSS1–SS3), the **stream** a senior student is in (Science,
Humanities, Business), and the **subject combination** each student sits (a compulsory core, stream
subjects, and electives such as Further Mathematics or one trade subject). JSS has no streams, but
has choices such as CRS or IRS.

## Decision

The owner approved the design as a whole (2026-10-08).

1. **An offering says who takes it.** Each `ClassSubject` has a `kind`:
   - `COMPULSORY` registers every student in the class (the old behaviour, and the default).
   - `ELECTIVE` registers nobody; staff choose students on the class subject grid or the student's
     page.
   - `STREAM` (with streams, below) registers the students in that stream.
2. **Choice groups.** A school-wide `SubjectChoiceGroup` ("Religion: choose 1", "Trade subject:
   choose 1") groups subjects by `Subject.choiceGroupId`. A rule applies to a student only where
   their class offers one of its subjects, with the minimum capped at how many the class offers.
   **A rule that is not met is a warning, never a block** (owner decision 2026-10-08): it shows on
   the class subject grid and the student's page, and saving still works.
3. **Registrations carry forward.** A new enrollment, on a class move or at rollover, is registered
   for the new class's compulsory subjects plus the subjects the student was registered for before,
   where the new class offers them. An offering keeps its kind into the next session.
4. **Streams become their own entity** (Science, Humanities, Business), set per enrollment, with an
   optional default stream on a class. JSS classes have none.
5. **Departments are teaching departments only.** Classes stop carrying a department; HOD scope
   comes from the department's subjects and the students registered in them.
6. **Every subject can be vetted.** School Admin may approve, reject or request changes on a
   question only when no HOD can: the subject has no department, the department has no active HOD,
   or the author is the department's only HOD. Self-review stays blocked.

Making an offering compulsory registers every enrolled student without a registration for it; a
student staff deregistered stays deregistered. Making it elective changes no registration. Nothing
in this ADR ever deletes a registration, and every change is effective for future exams only, as
ADR-0011 already required.

## Consequences

- Exams, eligibility, absence and results need no change: they already read registrations
  (`exam-eligibility.util.ts`, `exam-readiness.service.ts`). Electives stop producing false absences.
- Existing data keeps working: every existing offering migrated as `COMPULSORY`.
- Exam visibility (ADR-0037) is unchanged. Past exams keep the department copied onto them at
  creation, so moving a subject to a new department leaves history where it was.
- "All departments" on a subject was considered and set aside: a subject everyone takes is a
  compulsory offering, and letting every HOD approve it would bring back the tie-break ADR-0001
  rejected. Many departments per subject is rejected for the same reason.
- Students choosing their own subjects, HODs per level, and offering by level instead of per arm are
  candidates for later.

## Implementation

Built in three pull requests.

1. Offering kinds, choice groups, the class subject grid (`GET`/`PUT
/academics/classes/:id/subject-registrations`), registering electives from the student's page,
   and carry-forward on move and rollover. Migration `20261009090000_subject_offering_kinds`.
2. Streams: the entity, per-enrollment stream, class default, migration from class departments,
   import columns, results by stream, HOD scope moved off classes.
3. The School Admin review fallback, then the demo school and guides.

Exam readiness does not yet show choice-rule warnings; that is a candidate for the streams PR.
