# CBT Platform — Domain & Data Model Design

Yes. This is the right point to do it.

I would now treat the following as the **canonical domain model** for the product. It is deliberately technology-agnostic: we're defining **what exists, how it relates, what owns what, and what must remain immutable**.

The most important design choice is that we should **not model this as a simple CRUD application**.

The platform has several distinct domains:

```text
PLATFORM
│
├── School & Subscription
│
├── Identity & Access
│
├── Academic Structure
│
├── Assessment Content
│
├── Examination Administration
│
├── Attempts & Answers
│
├── Results & Analytics
│
└── Audit & Operational History
```

---

# 1. The Core Domain Map

At the highest level:

```text
                         PLATFORM
                            │
              ┌─────────────┴─────────────┐
              │                           │
          SUBSCRIPTION                  SCHOOL
                                          │
                    ┌─────────────────────┼───────────────────┐
                    │                     │                   │
                 PEOPLE                ACADEMICS          SETTINGS
                    │                     │
          ┌─────────┼─────────┐      ┌────┼────┐
          │         │         │      │    │    │
       Users      Roles    Memberships  Session  Term
                                      │
                               Department
                                      │
                              Class / Subject
                                      │
                              Assignments
                                      │
                            ┌─────────┴──────────┐
                            │                    │
                       QUESTION BANK          EXAMS
                            │                    │
                    Questions/Revisions     Exam Sessions
                            │                    │
                      Review Workflow       Attempts
                                                 │
                                             Answers
                                                 │
                                             Results
```

The critical idea is:

> **Questions are reusable academic assets. Exams are assessments built from question revisions. Attempts are individual student executions of an exam. Results are derived from attempts.**

---

# 2. Domain 1 — School

The **School** is the central tenant/business entity.

### School

Represents one customer school.

Core attributes:

- School ID
- School name
- Short name
- Contact information
- Address
- Motto
- Logo
- Primary brand colour
- Status
- Current academic session
- Created date

### School status

```text
PROVISIONAL
ACTIVE
SUSPENDED
EXPIRED
DEACTIVATED
```

### Relationships

```text
School
├── Users
├── Academic Sessions
├── Departments
├── Classes
├── Subjects
├── Questions
├── Exams
├── Results
├── Audit Events
└── Subscription
```

Everything belonging to a school must be traceable to that school.

---

# 3. Multi-Tenant Boundary

This is fundamental.

Every school-owned domain object should belong to exactly one school context.

For example:

```text
Question → School A
Exam → School A
Attempt → School A
Result → School A
Student → School A
```

A question from School A can never accidentally be attached to School B's exam.

This tenant boundary should be one of the strongest invariants in the system.

---

# 4. Domain 2 — Subscription

Subscription should be separate from the School entity.

## Subscription

Represents the school's commercial access.

Attributes:

- Subscription ID
- School
- Plan
- Start date
- Expiry date
- Status
- Activation reference
- Created by
- Renewal history

### Subscription status

```text
PENDING
ACTIVE
EXPIRING
EXPIRED
SUSPENDED
CANCELLED
```

---

# 5. Activation Key

I would model an **Activation Grant** rather than making the raw key the subscription itself.

## ActivationGrant

Contains:

- Grant ID
- School
- Subscription
- Key/reference
- Issued by
- Issued date
- Activated date
- Expiry
- Status

This allows us to retain activation history.

Example:

```text
School
 ├── Subscription 2026/27
 │     └── Activation Grant #001
 │
 └── Subscription 2027/28
       └── Activation Grant #002
```

---

# 6. Domain 3 — Identity

I would **not** make Student, Teacher, HOD, Moderator and School Admin completely separate login-account entities.

Instead:

## User

Represents a person's authentication/account identity.

Attributes:

- User ID
- Name
- Login identifier
- Credential state
- Account status
- Last login
- Created date
- Deactivated date

Then academic/person-specific information belongs elsewhere.

---

# 7. School Membership

A User belongs to a school through a:

## SchoolMembership

Attributes:

- Membership ID
- User
- School
- Status
- Joined date
- Left date

This gives us clean separation between:

**Who is the person?**

and:

**What is their relationship with this school?**

---

# 8. Role Assignment

A user should have one or more role assignments through:

## RoleAssignment

Attributes:

- Assignment ID
- Membership
- Role
- Start date
- End date
- Status

Roles:

```text
SOFTWARE_ADMIN
SCHOOL_ADMIN
MODERATOR
HOD
TEACHER
STUDENT
```

This is more flexible than putting a single `role` field directly on User.

---

# 9. Why this matters

Suppose someone is:

> Teacher + HOD

in the same school.

They can have:

```text
User
 └── SchoolMembership
       ├── TEACHER
       └── HOD
```

We shouldn't have to redesign the user when schools have unusual organizational structures.

We can still enforce which combinations are permitted.

---

# 10. Student Profile

Student-specific academic information belongs in:

## StudentProfile

Attributes:

- Student profile ID
- Membership
- Student ID
- Admission number
- Current status
- Admission date
- Graduation date

The actual current class assignment should **not simply be a permanent field here**, because students change classes every academic session.

That leads to the next entity.

---

# 11. Teacher Profile

## TeacherProfile

Attributes:

- Teacher profile ID
- Membership
- Staff ID
- Employment status
- Department relationship where applicable

Questions/exams should reference teacher identity through this profile.

---

# 12. HOD Profile

HOD doesn't necessarily need an entirely separate person table.

We can use:

**User + HOD RoleAssignment + DepartmentAssignment**

This is cleaner.

Similarly, School Admin and Moderator are primarily role-driven.

---

# 13. Domain 4 — Academic Structure

This domain represents the school's organizational academic hierarchy.

```text
School
  │
  └── AcademicSession
        │
        └── Term
              │
              ├── Department
              ├── Class
              └── Subject
```

But we need to be more precise.

---

# 14. Academic Session

## AcademicSession

Attributes:

- Session ID
- School
- Name
- Start date
- End date
- Status

Example:

```text
2026/2027
```

States:

```text
DRAFT
UPCOMING
CURRENT
CLOSED
ARCHIVED
```

Only one session per school can be CURRENT.

---

# 15. Term

## AcademicTerm

Attributes:

- Term ID
- Academic session
- Name
- Sequence/order
- Start date
- End date
- Status

Example:

```text
2026/2027
 ├── First Term
 ├── Second Term
 └── Third Term
```

---

# 16. Department

## Department

Attributes:

- Department ID
- School
- Name
- Code
- Status

Examples:

```text
Science
Business
Humanities
Technical
```

Departments are school-specific.

---

# 17. Class

This needs special attention because class identity is contextual.

## ClassGroup

Attributes:

- Class ID
- School
- Academic session
- Name
- Level
- Arm
- Department
- Status

Example:

```text
SS2A
```

belongs to:

```text
School X
Session 2026/2027
Science
```

The next year's `SS2A` is a separate ClassGroup.

---

# 18. Subject

## Subject

Attributes:

- Subject ID
- School
- Name
- Code
- Status

Example:

```text
MAT
Mathematics
```

The subject itself can survive across academic sessions.

Its use in a particular class/session is handled through assignment/mapping entities.

---

# 19. Class-Subject Offering

A very useful entity:

## ClassSubject

Represents:

> Mathematics is taught to SS2A during 2026/2027.

Attributes:

- ClassSubject ID
- Class
- Subject
- Academic session
- Department where relevant
- Active status

This becomes the basis for teacher assignments and exam eligibility.

---

# 20. Student Enrollment

Instead of simply putting:

`student.current_class = SS2A`

use:

## StudentEnrollment

Attributes:

- Enrollment ID
- Student
- Academic session
- Class
- Department
- Start date
- End date
- Status

Example:

```text
Ahmed
2026/2027 → SS2A
2027/2028 → SS3A
```

This preserves history.

---

# 21. Student Movement

If Ahmed moves:

```text
SS2A → SS2B
```

we preserve the original enrollment and create/update an effective assignment.

The historical exam remains tied to the original context.

This is one of the reasons we should never simply overwrite a student's current class.

---

# 22. Teacher Assignment

## TeacherAssignment

Represents:

> Mr Ade teaches Mathematics to SS2A.

Attributes:

- Assignment ID
- Teacher
- ClassSubject
- Academic session
- Start date
- End date
- Status

This is one of the most important authorization entities.

From this assignment, the system derives:

> What can this teacher access?

---

# 23. HOD Department Assignment

## HODAssignment

Attributes:

- HOD/user
- Department
- Academic session
- Start date
- End date
- Status

This determines which questions, teachers, exams and results the HOD may govern.

---

# 24. Domain 5 — Question Bank

Now we move into assessment content.

The conceptual hierarchy:

```text
Question
   │
   └── Question Revision
          │
          └── Review History
```

---

# 25. Question

## Question

Represents the logical question identity.

Attributes:

- Question ID
- School
- Subject
- Author
- Status
- Created date
- Archived date

A question is not the exact text/version used in an exam.

That belongs to the revision.

---

# 26. Question Revision

## QuestionRevision

This stores a specific version of a question.

Attributes:

- Revision ID
- Question
- Revision number
- Question content
- Question type
- Topic
- Subtopic
- Difficulty
- Marks
- Explanation
- Created by
- Created date
- Status

Example:

```text
Question Q-1004

Revision 1 → Rejected
Revision 2 → Approved
Revision 3 → Rejected
Revision 4 → Approved
```

---

# 27. Question Options

Don't store options as four hard-coded columns.

Use:

## QuestionOption

Attributes:

- Option ID
- Question revision
- Option label/order
- Option content
- Correct flag

This allows future question types without redesigning the whole model.

For example:

```text
A → 10
B → 15
C → 20
D → 25
```

---

# 28. Question Media

Questions may contain:

- Images
- Diagrams
- Supporting files

Rather than embedding all of this directly into Question, conceptually:

## QuestionMedia

Attributes:

- Media ID
- Question revision
- Type
- Reference
- Display order
- Metadata

This will later support Mathematics diagrams, Chemistry diagrams, image-based questions, etc.

---

# 29. Question Review

## QuestionReview

Represents one HOD review event.

Attributes:

- Review ID
- Question revision
- Reviewer
- Status
- Comment
- Created date
- Decision date

Example:

```text
Revision 1
Reviewer: Science HOD
Decision: REJECTED
Comment: "Two options are valid."
```

Review history is never overwritten.

---

# 30. Question State

The question's lifecycle is:

```text
DRAFT
    ↓
SUBMITTED
    ↓
UNDER_REVIEW
    ├─────────────┐
    ▼             ▼
APPROVED       REJECTED
                  │
                  ▼
                 DRAFT
```

The approval belongs to the **revision**, not simply the logical question.

---

# 31. Question Categories

I would create a future-compatible taxonomy:

## Topic

Example:

```text
Algebra
Quadratic Equations
```

Whether Topic/Subtopic become first-class entities or remain metadata can be decided later, but conceptually they belong in the model.

A question can therefore be:

```text
Mathematics
SS2
Algebra
Quadratic Equations
Medium
```

---

# 32. Domain 6 — Examination

Now the key distinction:

> **Question bank ≠ Exam.**

An exam is a particular assessment constructed from approved question revisions.

---

# 33. Exam

## Exam

Attributes:

- Exam ID
- School
- Academic session
- Term
- Class
- Subject
- Department
- Exam type
- Title
- Instructions
- Duration
- Attempt policy
- Navigation policy
- Randomization settings
- Result policy
- Created by
- Status

Example:

```text
First Term Mathematics Examination
SS2A
2026/2027
First Term
```

---

# 34. Exam Question

Do not directly associate Exam → Question.

Use:

## ExamQuestion

This represents:

> This specific question revision is part of this exam.

Attributes:

- ExamQuestion ID
- Exam
- QuestionRevision
- Sequence
- Marks
- Section where applicable

This is crucial.

---

# 35. Why ExamQuestion is important

Suppose Question 1004 changes later.

The 2026 exam still needs:

> Revision 2

while a 2027 exam uses:

> Revision 4.

So:

```text
Question Q1004
├── Revision 1
├── Revision 2 ← 2026 exam
├── Revision 3
└── Revision 4 ← 2027 exam
```

Historical integrity is preserved.

---

# 36. Exam Sections

We haven't formally needed this yet, but the model should allow:

## ExamSection

Examples:

```text
Section A — Objective
Section B — Theory
```

or:

```text
Section A — Algebra
Section B — Geometry
```

Even if the first release primarily uses one section, designing for sections gives us future flexibility.

---

# 37. Exam Configuration

Exam contains rules such as:

```text
Duration: 60 minutes
Attempts: 1
Randomize questions: yes
Randomize options: yes
Navigation: free
```

These are exam-specific properties.

---

# 38. Exam State

Canonical:

```text
DRAFT
READY
OPEN
CLOSED
COMPLETED
ARCHIVED
CANCELLED
```

---

# 39. Exam Readiness

I would model readiness as a **validation process**, not just a boolean.

An exam can only transition:

```text
DRAFT → READY
```

if all required checks pass.

Examples:

- Questions approved
- Questions present
- Duration valid
- Class valid
- Subject valid
- Eligible students exist
- Instructions configured

The resulting exam remains immutable enough to safely administer.

---

# 40. Domain 7 — Exam Administration Session

This is one of the most important additions from our latest discussion.

## ExamSession

Represents a **physical/operational sitting of an exam**, not a different examination.

Example:

```text
Mathematics First Term Exam
│
├── Session 1 — 20 students
├── Session 2 — 20 students
└── Makeup Session — 3 students
```

Attributes:

- ExamSession ID
- Exam
- Session type
- Opened by
- Opened at
- Closed by
- Closed at
- Status
- Notes
- Optional location/lab
- Optional invigilator

---

# 41. Exam Session Types

```text
STANDARD
BATCH
MAKEUP
SPECIAL
```

Though internally we may not actually need separate types for normal batches; this is mainly useful for reporting.

---

# 42. Exam Session State

```text
READY
OPEN
CLOSED
COMPLETED
CANCELLED
```

The exam itself can remain `OPEN` across multiple sessions.

This distinction solves the batch problem elegantly.

---

# 43. Session Membership / Authorization

We need a way to say:

> Student 21 is allowed to participate in Session 2.

So conceptually:

## ExamSessionParticipant

Attributes:

- Session participant ID
- Exam session
- Student
- Eligibility state
- Authorized by
- Authorization timestamp
- Status

This is particularly valuable for explicit batch control and makeup administration.

---

# 44. Domain 8 — Exam Attempt

An ExamSessionParticipant indicates permission/eligibility.

The **ExamAttempt** is the actual execution.

## ExamAttempt

Attributes:

- Attempt ID
- Exam
- Exam session
- Student
- Attempt number
- Attempt type
- Started at
- Expected expiry
- Submitted at
- State
- Participation status
- Accommodation reference where applicable

---

# 45. Attempt Type

```text
STANDARD
MAKEUP
RETRY
SPECIAL
```

Default:

**STANDARD**

A makeup attempt is still against the same Exam.

---

# 46. Attempt State

```text
NOT_STARTED
IN_PROGRESS
SUBMITTED
AUTO_SUBMITTED
INVALIDATED
CANCELLED
```

This is separate from participation status.

---

# 47. Participation Status

For reporting:

```text
PENDING
IN_PROGRESS
COMPLETED
ABSENT
EXCUSED
```

We should not overload one status field to represent both attempt execution and attendance.

---

# 48. Attempt Timer

The attempt should preserve the timing context:

- Started at
- Duration granted
- Expected expiry
- Actual submission
- Time used

This makes timer auditing possible.

Example:

```text
Started: 09:12
Duration: 60 min
Expires: 10:12
Submitted: 10:04
```

---

# 49. Domain 9 — Attempt Answers

This is the raw assessment evidence.

## AttemptAnswer

Attributes:

- Attempt answer ID
- Attempt
- ExamQuestion
- Selected answer
- Answer value/content
- Answered at
- Last updated
- State

This should represent exactly what the student submitted.

---

# 50. Why answers must be separate from results

Never rely on:

> Result = 86%

as the source of truth.

The system must retain:

```text
Attempt
 ├── Answer Q1
 ├── Answer Q2
 ├── Answer Q3
 └── ...
```

Then:

```text
Answers
   ↓
Marking
   ↓
Result
```

This lets us reconstruct and audit the result.

---

# 51. Attempt Question Snapshot

This deserves special attention.

When an attempt begins, we must preserve the exact examination presentation.

Why?

Because questions may later be revised, archived, or even removed from the active question bank.

The attempt still needs the exact content the student saw.

Therefore we conceptually need an:

## AttemptQuestionSnapshot

It preserves things such as:

- Question text
- Options
- Correct-answer reference for marking
- Marks
- Display order
- Option order
- Question revision reference

This means:

```text
Question Bank changes later
        ↓
Historical attempt DOES NOT CHANGE
```

This is critical.

---

# 52. Randomization

Question randomization is therefore an **attempt-level concern**.

Exam defines:

> Randomization enabled.

But the actual order is determined per attempt.

Example:

```text
Exam:
Q1 Q2 Q3 Q4 Q5

Student A:
Q3 Q1 Q5 Q2 Q4

Student B:
Q2 Q5 Q1 Q4 Q3
```

The attempt snapshot records the actual order.

---

# 53. Option Randomization

Same principle.

Exam:

```text
A
B
C
D
```

Attempt A may receive:

```text
C
A
D
B
```

Attempt B:

```text
B
D
A
C
```

That order belongs to the attempt snapshot.

---

# 54. Domain 10 — Result

Result should represent the finalized assessment outcome.

## Result

Attributes:

- Result ID
- Attempt
- Student
- Exam
- Total possible marks
- Earned marks
- Percentage
- Grade where configured
- Correct count
- Incorrect count
- Unanswered count
- State
- Published at

---

# 55. Result Lifecycle

Conceptually:

```text
PROCESSING
   ↓
FINAL
   ↓
PUBLISHED
```

Administrative reversal:

```text
PUBLISHED
   ↓
UNPUBLISHED
```

Correction:

```text
FINAL/PUBLISHED
   ↓
ADJUSTED
```

with audit history.

---

# 56. Result Must Be Derived, Not Manually Entered

For objective questions:

```text
Attempt Answers
      ↓
Answer Evaluation
      ↓
Question Scores
      ↓
Attempt Total
      ↓
Result
```

This means the raw answer evidence always exists.

---

# 57. Question Result

To support detailed analytics, we should conceptually have:

## AttemptQuestionResult

Attributes:

- Attempt
- ExamQuestion
- Awarded marks
- Correct/incorrect
- Answer state

This allows:

> Question 17 was answered incorrectly.

and:

> 37% of students got Question 17 correct.

---

# 58. Result Adjustment

## ResultAdjustment

Used only for controlled corrections.

Attributes:

- Adjustment ID
- Result
- Type
- Reason
- Old value
- New value
- Authorized by
- Created at

Examples:

```text
VOID_QUESTION
AWARD_MARK
DEDUCT_MARK
RECALCULATE
MANUAL_OVERRIDE
```

Manual override should be heavily restricted.

---

# 59. Domain 11 — Result Publication

Publication can be treated as a separate concern.

## ResultPublication

Attributes:

- Publication ID
- Exam/result scope
- Published by
- Published at
- Visibility state

This lets us support:

- Teacher publishes
- School Admin publishes
- Automatic publication

without changing the Result itself.

---

# 60. Domain 12 — Makeup

Makeup isn't a separate exam.

It is a controlled access/attempt process.

We should represent authorization explicitly.

## MakeupAuthorization

Attributes:

- Authorization ID
- Exam
- Student
- Authorized by
- Reason
- Granted at
- Expires at if applicable
- Status

Then:

```text
MakeupAuthorization
        ↓
ExamSession
        ↓
ExamAttempt
        ↓
Result
```

---

# 61. Domain 13 — Attendance / Participation

The system should be able to answer:

> Who participated?

This doesn't require a separate huge attendance system.

Participation can be derived from:

- Session participant
- Attempt
- Final status

But for explicit recorded administrative decisions, we may have:

## ExamParticipation

Attributes:

- Exam
- Student
- Session
- Status
- Recorded by
- Recorded at

Statuses:

```text
PENDING
ATTENDED
ABSENT
EXCUSED
```

This should coexist cleanly with ExamAttempt.

---

# 62. Domain 14 — Accommodations

For production readiness, I recommend a dedicated concept.

## StudentAssessmentAccommodation

Attributes:

- Student
- Exam or general scope
- Type
- Value
- Approved by
- Effective dates

Examples:

```text
EXTENDED_TIME = +15 minutes
LARGER_TEXT = true
```

This must be explicitly authorized.

---

# 63. Domain 15 — Audit

## AuditEvent

This is a cross-domain entity.

Attributes:

- Event ID
- School
- Actor
- Actor role
- Action
- Entity type
- Entity ID
- Timestamp
- Reason/context
- Before/after metadata where appropriate

Examples:

```text
QUESTION_APPROVED
EXAM_OPENED
STUDENT_GRANTED_MAKEUP
ATTEMPT_INVALIDATED
RESULT_ADJUSTED
TEACHER_ASSIGNMENT_CHANGED
```

Audit events should not be editable through ordinary application flows.

---

# 64. Domain 16 — Notifications

## Notification

Attributes:

- Notification ID
- Recipient
- School
- Type
- Title
- Content
- Created at
- Read at
- Action reference

Examples:

```text
QUESTION_REJECTED
QUESTION_APPROVED
RESULT_PUBLISHED
EXAM_OPENED
MAKEUP_GRANTED
```

These are operational, not social.

---

# 65. Domain 17 — Files / Media

There will be several types of files:

- School logo
- Question images
- Question diagrams
- Potential report exports

Conceptually:

## MediaAsset

Attributes:

- Media ID
- School
- Owner/entity
- Type
- Reference
- Metadata
- Created at

The important part at domain level is:

> Media is attached to a specific business object and must inherit its tenant/security boundary.

---

# 66. Relationships — Core ER View

Here is the core relational picture conceptually:

```text
SCHOOL
 │
 ├──── SUBSCRIPTION
 │
 ├──── USER MEMBERSHIPS
 │        │
 │        └──── ROLE ASSIGNMENTS
 │
 ├──── ACADEMIC SESSION
 │        │
 │        └──── TERM
 │
 ├──── DEPARTMENT
 │
 ├──── SUBJECT
 │
 ├──── CLASS
 │        │
 │        └──── CLASS SUBJECT
 │
 ├──── STUDENT ENROLLMENT
 │
 ├──── TEACHER ASSIGNMENT
 │
 ├──── HOD ASSIGNMENT
 │
 ├──── QUESTION
 │        │
 │        └──── QUESTION REVISION
 │                 │
 │                 ├──── QUESTION OPTION
 │                 ├──── QUESTION MEDIA
 │                 └──── QUESTION REVIEW
 │
 └──── EXAM
          │
          ├──── EXAM QUESTION
          │          │
          │          └──── QUESTION REVISION
          │
          └──── EXAM SESSION
                    │
                    ├──── SESSION PARTICIPANT
                    │
                    └──── EXAM ATTEMPT
                              │
                              ├──── ATTEMPT QUESTION SNAPSHOT
                              │
                              ├──── ATTEMPT ANSWER
                              │
                              ├──── ATTEMPT QUESTION RESULT
                              │
                              └──── RESULT
                                        │
                                        └──── RESULT ADJUSTMENT
```

This is the heart of the platform.

---

# 67. Ownership Model

We should explicitly establish ownership.

### School owns

- Academic structure
- Users/memberships
- Questions
- Exams
- Attempts
- Results
- Reports

### User owns

- Personal account identity
- Personal authentication information

### Teacher owns operationally

- Questions they create
- Exams they create

But ownership does **not** mean unlimited mutation after approval/execution.

### HOD governs

- Academic review
- Department oversight

### School Admin governs

- School configuration and operations

### Software Admin governs

- Platform and subscription

---

# 68. Immutable vs Mutable Data

This distinction is extremely important.

## Mutable

These can change:

- School branding
- Upcoming class configuration
- Teacher assignments
- User contact information
- Draft questions
- Draft exams

## Controlled mutation

These can change only through explicit workflows:

- Approved question revisions
- Active exams
- Published results
- Student class movement
- HOD assignment

## Effectively immutable

These should never be silently modified:

- Submitted student answers
- Completed attempt records
- Historical question snapshots
- Historical result evidence
- Audit events
- Historical session context

---

# 69. The Historical Record Chain

This is one of the most important principles in the entire model.

Suppose a student took Mathematics in 2026.

We should be able to navigate:

```text
Student
  ↓
Enrollment
  ↓
Class
  ↓
Exam
  ↓
Exam Session
  ↓
Attempt
  ↓
Question Snapshot
  ↓
Answer
  ↓
Question Result
  ↓
Final Result
```

Everything required to reconstruct the examination exists.

That is what makes the system trustworthy.

---

# 70. A Concrete Example

Greenfield College:

```text
School
└── Greenfield College
```

Session:

```text
2026/2027
```

Class:

```text
SS2A
```

Subject:

```text
Mathematics
```

Teacher:

```text
Mr Ade
```

Question:

```text
Q-1004
```

Approved revision:

```text
Revision 2
```

Exam:

```text
First Term Mathematics Examination
```

Exam question:

```text
ExamQuestion #17
→ Q-1004 Revision 2
```

Student:

```text
Ahmed Bello
```

Exam session:

```text
Session 2
```

Attempt:

```text
Attempt #1
```

Snapshot:

```text
Question presented as #12
Options randomized
```

Answer:

```text
Selected option B
```

Result:

```text
Awarded 1/1
```

This complete chain is preserved.

---

# 71. Why We Should Not Store "Current Class" as the Whole Truth

A common simplistic model would do:

```text
Student
 └── class_id
```

That is insufficient for this product.

Because then:

```text
2026 → SS2A
2027 → SS3A
```

would overwrite the previous context.

Instead:

```text
Student
 └── StudentEnrollment
       ├── 2026/2027 → SS2A
       └── 2027/2028 → SS3A
```

The student's current class can be derived from the active enrollment.

---

# 72. Why We Should Not Store "Correct Answer" Only on Exam

Correct answer originates from the approved question revision.

But once the exam starts, we snapshot the relevant content.

Therefore:

```text
Question Revision
      ↓
Exam Question
      ↓
Attempt Snapshot
      ↓
Marking
```

This protects against future edits.

---

# 73. Why ExamSession Exists

Without it we'd have:

```text
Exam
 └── Attempts
```

and then no clean answer to:

> Which 20 students were part of Batch 1?

With ExamSession:

```text
Exam
├── Session 1
│    ├── Student A
│    └── Student B
│
├── Session 2
│    ├── Student C
│    └── Student D
│
└── Makeup
     └── Student E
```

This is a major advantage for our actual use case.

---

# 74. Why Attempt Snapshot Exists

Without it, a later question edit could potentially make history inconsistent.

For example:

**August 24:**

Question answer = B.

**September 10:**

Teacher fixes question.

Answer = C.

Ahmed's August exam must still be marked according to what was valid for that attempt.

The snapshot ensures that.

---

# 75. Analytics Should Be Derived, Not the Source of Truth

Things like:

> Average score = 68.7%

should not be the authoritative stored academic record.

We should be able to derive analytics from:

```text
Attempts
Results
Question Results
Participation
```

We can later optimize/cachе analytics, but the underlying data remains authoritative.

---

# 76. Domain Boundary Summary

This gives us clear bounded domains:

### School & Commercial

```text
School
Subscription
ActivationGrant
```

### Identity & Access

```text
User
SchoolMembership
RoleAssignment
StudentProfile
TeacherProfile
```

### Academic

```text
AcademicSession
AcademicTerm
Department
ClassGroup
Subject
ClassSubject
StudentEnrollment
TeacherAssignment
HODAssignment
```

### Assessment Content

```text
Question
QuestionRevision
QuestionOption
QuestionMedia
QuestionReview
```

### Examination

```text
Exam
ExamSection
ExamQuestion
ExamSession
ExamSessionParticipant
```

### Execution

```text
ExamAttempt
AttemptQuestionSnapshot
AttemptAnswer
AttemptQuestionResult
ExamParticipation
MakeupAuthorization
Accommodation
```

### Results

```text
Result
ResultAdjustment
ResultPublication
```

### Platform Operations

```text
AuditEvent
Notification
MediaAsset
```

That is a strong domain model.

---

# 77. Important Business Invariants

These should eventually become non-negotiable rules in the implementation.

### School isolation

A record cannot belong to another school's context.

### Teacher scope

Teacher actions require valid TeacherAssignment.

### HOD scope

Question review requires valid HODAssignment.

### Exam integrity

Only approved question revisions may enter an executable exam.

### Attempt integrity

A completed attempt cannot be silently restarted.

### Timer integrity

Attempt duration cannot be extended by reconnecting.

### Result integrity

A result cannot exist without a corresponding attempt.

### Historical integrity

A completed attempt retains its question snapshot.

### Absence integrity

Absence does not create a zero score automatically.

### Makeup integrity

Makeup must create a new attempt and never overwrite the original attendance record.

### Audit integrity

High-impact state changes produce audit events.

---

# 78. One Deliberate Design Choice: No Separate "HODQuestion" or "ModeratorQuestion"

We should resist creating role-specific copies of the same domain object.

There is only:

**Question**

and its workflow.

The HOD is a reviewer.

The teacher is a creator.

The moderator is an operational administrator.

The School Admin is a supervisory authority.

This keeps the model clean.

---

# 79. One Deliberate Design Choice: No "Batch Exam" Entity

We also shouldn't create a separate:

> BatchExam

entity.

A batch is operational context.

So:

```text
Exam
 └── ExamSession
```

is enough.

That prevents the system from becoming cluttered with artificial duplicates.

---

# 80. One Deliberate Design Choice: No Separate "Makeup Exam"

Same reason.

Makeup is:

```text
MakeupAuthorization
      ↓
ExamSession
      ↓
ExamAttempt
```

The underlying examination remains one examination.

This is critical for reporting.

---

# 81. One Deliberate Design Choice: User vs Student

A Student is both:

**a user identity**

and

**an academic person**.

Therefore:

```text
User
 └── SchoolMembership
       └── StudentProfile
```

This gives us clean separation.

Same for Teacher.

---

# 82. One Deliberate Design Choice: Result vs Attempt

An Attempt represents:

> **What the student did.**

A Result represents:

> **What the system concluded from it.**

That's why they must remain separate.

---

# 83. One Deliberate Design Choice: Exam vs Exam Session

An Exam represents:

> **What assessment is being administered.**

An ExamSession represents:

> **When/how a particular group of students was operationally allowed to take it.**

This perfectly matches our physical CBT-lab model.

---

# 84. Final Canonical Domain Model

If I had to reduce the entire system to its essential entities, this would be it:

```text
PLATFORM
│
├── School
├── Subscription
├── ActivationGrant
│
├── User
├── SchoolMembership
├── RoleAssignment
│
├── AcademicSession
├── AcademicTerm
├── Department
├── ClassGroup
├── Subject
├── ClassSubject
├── StudentProfile
├── TeacherProfile
├── StudentEnrollment
├── TeacherAssignment
├── HODAssignment
│
├── Question
├── QuestionRevision
├── QuestionOption
├── QuestionMedia
├── QuestionReview
│
├── Exam
├── ExamSection
├── ExamQuestion
├── ExamSession
├── ExamSessionParticipant
│
├── ExamAttempt
├── AttemptQuestionSnapshot
├── AttemptAnswer
├── AttemptQuestionResult
├── ExamParticipation
├── MakeupAuthorization
├── StudentAssessmentAccommodation
│
├── Result
├── ResultAdjustment
├── ResultPublication
│
├── AuditEvent
├── Notification
└── MediaAsset
```

---

# 85. The Most Important Relationships

And the central relationships can be summarized as:

```text
SCHOOL
  │
  ├── USERS
  │    └── MEMBERSHIPS
  │         └── ROLES
  │
  ├── ACADEMIC SESSION
  │    └── TERM
  │
  ├── CLASS
  │    └── CLASS SUBJECT
  │
  ├── STUDENT
  │    └── ENROLLMENT
  │
  ├── TEACHER
  │    └── ASSIGNMENT
  │
  ├── QUESTION
  │    └── REVISION
  │         ├── OPTIONS
  │         ├── MEDIA
  │         └── REVIEWS
  │
  └── EXAM
       ├── EXAM QUESTIONS
       │    └── APPROVED QUESTION REVISION
       │
       └── EXAM SESSIONS
            ├── PARTICIPANTS
            └── ATTEMPTS
                 ├── QUESTION SNAPSHOTS
                 ├── ANSWERS
                 ├── QUESTION RESULTS
                 └── FINAL RESULT
```

---

# 86. What We've Achieved

The progression is now:

```text
PRODUCT VISION
      ↓
ROLES
      ↓
PERMISSION MATRIX
      ↓
SCHOOL LIFECYCLE
      ↓
MODULE/SCR​EEN HIERARCHY
      ↓
FUNCTIONAL REQUIREMENTS
      ↓
DOMAIN MODEL
      ↓
DATA MODEL
      ↓
TECHNICAL ARCHITECTURE
```

We're now **one step away from architecture**.

But I would make one more product/model artifact before choosing technologies:

## The canonical ERD + state-transition specification

That should take this conceptual model and explicitly define, for every entity:

**Primary identity → attributes → relationships → cardinality → lifecycle states → immutable fields → ownership → permissions → deletion/archive rules.**

Most importantly, we should map the exact examination transaction:

```text
Exam Ready
   ↓
Exam Session Opened
   ↓
Student Authorized
   ↓
Attempt Created
   ↓
Question Snapshot Created
   ↓
Answers Persisted
   ↓
Attempt Submitted / Timed Out
   ↓
Question Results Calculated
   ↓
Result Finalized
   ↓
Result Published
```

That is the core transaction of the entire platform. Once that is nailed down, we can move into the actual **architecture, database strategy, API boundaries, caching/offline strategy, infrastructure, security model, and deployment design** without having to revisit the fundamental data model.
