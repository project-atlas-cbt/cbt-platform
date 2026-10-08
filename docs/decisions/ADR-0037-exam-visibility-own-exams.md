# ADR-0037 — Exams are private to their author

**Status:** Accepted
**Date:** 2026-10-08
**Deciders:** Haneef (project owner)
**Audit findings:** none
**Affects phases:** B11, B15, F11, F15, F17 (amends `02 §5`'s Teacher column)

## Context

`02 §5` grants a Teacher **View all exams: Assigned** and **View individual student result:
Assigned students**. The permission table carried both as `ASSIGNED`, so every teacher of one of an
exam's class-subjects could list and open a colleague's exam, and open single results of it. Every
action (edit, questions, rules, publish, Exam Control, makeup, results) was already `OWNED` and
refused on the server. But a co-teacher who opened such an exam landed in the full builder, whose
buttons all failed with "no permission". The owner saw this and asked who can see what
(2026-10-08). The write-up is `/mnt/project-files/permissions-review/exams-and-results.md`.

The same review found two HOD gaps in the exam list. First, an exam whose subject has no
department was visible to no HOD. That is unchanged and now intended. Second, an HOD who also
teaches lost sight of their own exams outside the department, because the list stopped at the HOD
rule.

## Decision

The owner chose **own exams only**:

1. **A Teacher sees an exam only if they created it, or were delegated to run it**
   (`ExamAdministrator`, ADR-0012). Teaching one of its classes grants nothing.
   - `exam.viewAll` and `results.viewIndividualResult` are `OWNED` for TEACHER.
   - A colleague's exam answers "not found".
2. **A delegate runs the exam from Exam Control only.** They cannot edit it or see its results
   (`results.*` checks never pass the exam id to the delegation resolver, as before).
3. **An HOD sees their departments' exams.** A user who is both HOD and Teacher gets the union of
   the two rules.
4. **An exam whose subject has no department** is seen only by its author, its delegates and the
   school's Admin and Moderators. The subjects screen flags subjects with no department.
5. **The builder refuses non-owners on screen.** Anyone but the author sees who owns the exam and
   a link to Exam Control, never the edit form.
   - The teacher's Exams, Results, Reports and dashboard lists ask only for the teacher's own exams.
   - Exam Control and Makeup also list delegated exams.

Unchanged:

- Class and student analytics (`analytics.class`, `analytics.studentHistory`) stay `ASSIGNED`.
  They describe the teacher's own students across exams, not a colleague's exam.
- Every action permission is unchanged.

## Consequences

- Two teachers of the same class and subject no longer share exams by default. To let a colleague
  run an exam, the author adds them as a delegate. Shared authoring is a candidate for later if
  schools ask for it.
- `exam-visibility.integration.test.ts` pins the rule for each role. It covers the author, a
  co-teacher, a delegate, an HOD who teaches, and the Admin and Moderator.
