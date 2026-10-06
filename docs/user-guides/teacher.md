# Teacher guide

For teachers, and for HODs, who also review questions. Sign in at `https://<school>.<root>` with
the username your school gave you. The first time, use the link in your invitation email to set
your password; the link opens on your school's own address.

The platform is for examinations only: question bank, exams, running a sitting, results. It is not
a place for notes, homework or messages.

## 1. Questions

**Question Bank** holds the questions you can use. A question goes through these states:

| State     | Meaning                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| Draft     | Yours to edit. Nobody else uses it.                                                  |
| Submitted | Sent with **Submit for review**. Your HOD reviews it.                                |
| Approved  | Can be put into an exam. An approved revision never changes.                         |
| Rejected  | Returned with the HOD's reason. Edit it and submit again (Question Bank → Rejected). |

- Each question has a subject, a level (for example SS2, not SS2A) and a topic. You can write
  questions only for subjects and levels you teach.
- To change an approved question, edit it: that creates a new revision, which goes through review
  again. Exams that already use the old revision keep it, so past results stay exactly as marked.
- Many questions at once: **Question Bank → Import**, from the CSV template. In Excel, format the
  option columns as Text before typing, so an answer like 1/2 is not turned into a date.

**HODs:** **Question Review** is a queue. For each question: **Approve**, **Reject** with a reason
the teacher will read, or **Request changes**. Keyboard shortcuts are shown on the screen.

## 2. Exams

**Exams → New exam**, then the four steps:

1. **Details**: subject, title, duration, attempts allowed, the classes (arms) sitting it.
2. **Questions**: choose approved questions and their marks. Every student gets the same
   questions; their order, and the order of options, is shuffled per student.
3. **Rules**: how results are shown and when (your school's result policy applies). If your school
   has locked its result settings, you can't change who releases results or what students see.
4. **Review**: the readiness checklist. **Save as Ready** works only once every item passes.

A ready exam does nothing until a session is opened for it in **Exam Control**.

## 3. Running a sitting

**Exam Control** is the live view of an exam. There is no single start time: each student's timer
starts when **they** press Start, and the server keeps it.

- **Open session** lets the students in that session start. You can run the same exam in several
  sessions (batches) when there are more students than computers. **Close session** stops new
  starts in that session and **Reopen session** undoes it.
- **Close new attempts** stops anyone starting the exam at all. Students already writing finish
  their own time; no student's timer is ever paused.
- The **Live attempts** table shows who has not started, who is writing, who has submitted and
  who is **Disconnected** (nothing heard from that computer for more than 90 seconds). Disconnected
  rows sort first. A disconnected student usually just has a network problem: their answers are
  kept on the computer. See the [invigilator guide](invigilator.md).
- Signals such as "left the exam window" appear as plain counts. They are not evidence of
  cheating; read them only alongside what the invigilator saw.
- **Delegated administrators** lets another staff member run Exam Control for this exam (for
  example the invigilator in the lab).

Ending the exam, absence and makeups (Exam Control → Participation, Makeup):

- When every session is closed, **end the examination**. You confirm the list of authorised
  students who never started; they are recorded **absent**. This is permanent: the exam is
  Completed and cannot be reopened. Absence is recorded separately from scores and is never erased.
- **Grant makeup** gives an absent student a new attempt at the same exam later; it is available
  only once the exam is completed. **Authorize exceptional reattempt** is for a student whose
  attempt failed for a reason that was not theirs; it is audited and needs a reason.

## 4. Results

Objective questions are marked automatically when each attempt is submitted (or when its time runs
out). **Results** shows each exam's results as they are marked.

- **Publish results** releases them to students, according to your school's result policy.
  Publishing releases every result for the exam except those withheld or voided.
- **Withhold from student** keeps one student's result back (for example during an investigation);
  **Release to student** undoes it.
- **Override marks** is for a recorded, justified correction. It needs a reason, keeps the
  original score, and is audited.
- **Reports** exports results as CSV and prints result sheets.

## Getting help

Your school admin manages accounts and classes. During an exam, problems with the platform go to
the support contact your school was given at onboarding.
