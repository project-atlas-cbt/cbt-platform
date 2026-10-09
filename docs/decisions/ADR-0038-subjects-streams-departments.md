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
   - `STREAM` (with streams, below) registers the students in that stream. (Built as an elective
     with streams, not a third kind: see the streams amendment.)
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

1. Offering kinds, choice groups, the class subject lists (`GET`/`PUT
/academics/classes/:id/subject-registrations`), the student's subject checklist, form teachers,
   teacher access and the student history (amendment below), and carry-forward on move and
   rollover. Migrations `20261009090000_subject_offering_kinds`,
   `20261009120000_form_teacher_assignments`.
2. Streams: the entity, per-enrollment stream, class default, migration from class departments,
   import columns, results by stream, HOD scope moved off classes (amendment below). Migration
   `20261009150000_streams`.
3. The School Admin review fallback, then the demo school and guides.

Exam readiness does not yet show choice-rule warnings; that is a candidate for the streams PR.

## Amendment — who sets registrations, and the screens (2026-10-09)

**Context.** Reviewing the first build, Haneef found the class subject grid (students down,
subjects across) unworkable: an SS class with many subjects scrolls sideways, and in a class of 100
nobody can find a student. And in a school of 1,000 students, leaving every registration to one
School Admin or Moderator is a bottleneck. Teachers had no way to help: they cannot open Academics.

**Decision (Haneef, 2026-10-09: "Both").**

- **Screens.** The grid is replaced by a per-subject list: pick a subject, then tick its students
  in a searchable list that runs down the page. One student's subjects are a checklist on their
  page. Both save through the same all-or-nothing endpoint.
- **Subject teachers** may set registrations for the **elective** offerings they teach (an ACTIVE
  `TeacherAssignment`), from Teacher › My classes.
- **Form teachers.** A new assignment, not a role: `FormTeacherAssignment` (class, teacher, ACTIVE
  or ENDED; several per arm allowed; ended, never deleted). School Admin and Moderator set it on
  the class's Teachers tab under the existing `assignments.teacherToClass` permission ("Assign
  teacher → class"), which had no route until now. A form teacher may set **every elective** of
  that class and sees its roster.
- **Compulsory subjects stay with School Admin and Moderator.** Registration decides who may sit an
  exam, so no teacher can remove a student from a subject every classmate takes.
- New permission row `registrations.manage` (School Admin/Moderator SCHOOL, Teacher ASSIGNED, HOD
  and Student denied). The guard passes a teacher optimistically; `registration-scope.util.ts`
  narrows every read and write to the electives above and refuses anything else with 403.
- **Academic history** on the student page is rebuilt as one block per session: class, subjects,
  dated changes saying from what to what and by whom (from the audit log), the rollover outcome
  and its reason, and exam counts. `GET /students/:id/history`, read-only, no new tables.

**Candidate / Deferred.** The teacher assignments page (People › Teachers › Assignments) has the
same sideways-scrolling matrix; the same "pick one, then tick" pattern should replace it.

## Amendment — how streams are built (2026-10-09)

**Context.** Building PR 2 (streams). Decision 1 named a third offering kind, `STREAM`. Adding an
enum value and writing it in the same release breaks the expand-only migration rule
(`docs/operations/migrations.md`): a server still on the old code would fail to read the new value
during a rolling deploy.

**Decision.**

- **No `STREAM` kind.** A stream subject is an `ELECTIVE` offering with one or more streams in the
  new `ClassSubjectStream` join (`class_subject_streams`). A student is registered automatically
  for a compulsory offering, or for an elective whose streams include theirs. A plain elective
  (no streams) still registers nobody. One subject can serve several streams (Economics for
  Business and Humanities). Streams on a compulsory offering are refused.
- **`Stream`** (`streams`: name, code, ACTIVE or INACTIVE) per school, separate from `Department`.
  `ClassGroup.defaultStreamId` (optional) is copied onto each new enrollment;
  `StudentEnrollment.streamId` is the student's stream for that session. An inactive stream stays
  on the rows that have it but cannot be newly picked; a stream in use cannot be deleted.
- **Giving an existing class a stream** can also place its current students who are in no stream
  (`placeStudentsWithoutStream` on `PATCH /academics/classes/:id`, ticked by default on the class
  form). Each placement is audited as a stream change; students already in a stream keep theirs.
- **Changing a student's stream** (`PUT /students/:id/stream`, `assignments.studentToClass`)
  registers the new stream's subjects and deregisters those that were theirs only through the old
  stream. Compulsory subjects and hand-picked electives are untouched. Audited
  (`STUDENT_STREAM_CHANGED`) and shown in the student history.
- **Migration** `20261009150000_streams` makes one stream per department that any class (or
  rollover class draft) used, with the same name and code, sets each such class's default stream
  and each enrollment's stream from its class. `ClassGroup.departmentId` and
  `RolloverClassDraft.departmentId` are kept (expand-only) but no longer written or read; the
  class API takes `defaultStreamId` instead of `departmentId`.
- **HOD scope** over classes, rosters, rollover drafts and class analytics comes only from the
  subjects a class offers in the HOD's departments. `GET /academics/classes?departmentId=` lists
  those classes.
- **Rollover** keeps a class's default stream, each offering's streams, and each student's stream
  (the target class's default first, else the student's own). The student-decisions filter is by
  stream.
- **Imports.** The students template is `Student ID, First Name, Last Name, Class, Stream,
Electives`. Stream and Electives are optional; Electives are separated by `;` or `,` and must be
  offered by the class. A file with the old `Department` column still imports, read as Stream.
- **Results by stream.** School analytics adds a stream comparison: results whose student was in
  that stream in the exam's session.

Choice-rule warnings in exam readiness stay a candidate.
