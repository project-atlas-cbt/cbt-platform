# CBT Platform — Canonical ERD & State-Transition Specification

## 1. Purpose

This specification is the final product/data-model contract immediately preceding technical architecture.

It defines:

- Entity identity and ownership
- Core attributes
- Relationships and cardinality
- Lifecycle states
- Immutable data
- Permission boundaries
- Archive/deletion behaviour
- Cross-entity business invariants
- The complete examination execution transaction

The model is designed around one principle:

> **The platform must always be able to reconstruct what school, class, subject, questions, question versions, students, exam session, attempts, answers, and results existed at the time an assessment occurred.**

---

# 2. Entity Classification

The entities are grouped into eight bounded domains.

| Domain              | Entities                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| School & Commercial | School, Subscription, ActivationGrant                                                                                                              |
| Identity & Access   | User, SchoolMembership, RoleAssignment, StudentProfile, TeacherProfile                                                                             |
| Academic Structure  | AcademicSession, AcademicTerm, Department, ClassGroup, Subject, ClassSubject, StudentEnrollment, TeacherAssignment, HODAssignment                  |
| Assessment Content  | Question, QuestionRevision, QuestionOption, QuestionMedia, QuestionReview                                                                          |
| Examination         | Exam, ExamSection, ExamQuestion, ExamSession, ExamSessionParticipant                                                                               |
| Execution           | ExamAttempt, AttemptQuestionSnapshot, AttemptAnswer, AttemptQuestionResult, ExamParticipation, MakeupAuthorization, StudentAssessmentAccommodation |
| Results             | Result, ResultAdjustment, ResultPublication                                                                                                        |
| Platform Operations | AuditEvent, Notification, MediaAsset                                                                                                               |

---

# 3. Global Data Rules

## 3.1 Every school-owned entity has a school boundary

Where applicable, records contain a direct or derivable `school_id`.

The system must never permit an object from School A to be referenced by an object belonging to School B.

---

## 3.2 Historical context is preserved

Historical academic records retain their original:

- School
- Academic session
- Term
- Department
- Class
- Subject
- Student
- Teacher
- Question revision

Current assignments can change without modifying historical records.

---

## 3.3 Destructive deletion is exceptional

The default lifecycle for meaningful records is:

**Active → Inactive/Archived**

rather than physical deletion.

Hard deletion should generally be limited to:

- Incomplete provisional records
- Unused configuration
- Data explicitly covered by a future retention policy

Academic evidence should not be hard-deleted through ordinary school workflows.

---

## 3.4 Audit-sensitive operations are append-only

Actions such as:

- Question approval
- Exam activation
- Attempt invalidation
- Result adjustment
- User deactivation
- Student promotion

must create historical events rather than overwrite the past.

---

# 4. SCHOOL & COMMERCIAL DOMAIN

# 4.1 School

### Identity

`school_id`

### Core attributes

- name
- short_name
- school_code
- logo
- primary_colour
- contact information
- address
- status
- created_at
- updated_at

### State

```text
PROVISIONAL
ACTIVE
SUSPENDED
EXPIRED
DEACTIVATED
```

### Relationships

```text
School 1 ──── N Subscription
School 1 ──── N ActivationGrant
School 1 ──── N SchoolMembership
School 1 ──── N AcademicSession
School 1 ──── N Department
School 1 ──── N ClassGroup
School 1 ──── N Subject
School 1 ──── N Question
School 1 ──── N Exam
School 1 ──── N AuditEvent
```

### Ownership

Owned by the platform.

### School Admin permissions

Can configure school-owned information where permitted.

### Software Admin permissions

Full platform-level management.

### Immutable fields

Once operational, the following should not be changed without an explicit audited operation:

- school_id
- creation date
- original onboarding identity

The name/logo/branding itself is mutable.

### Deletion

A school with historical data is never normally deleted. It becomes `DEACTIVATED`.

---

# 4.2 Subscription

### Identity

`subscription_id`

### Attributes

- school_id
- plan
- start_at
- expires_at
- status
- created_at
- updated_at

### State

```text
PENDING
ACTIVE
EXPIRING
EXPIRED
SUSPENDED
CANCELLED
```

### Relationship

```text
School 1 ──── N Subscription
```

One school may have many historical subscriptions, but normally only one active subscription.

### Ownership

Platform.

### Permissions

Software Admin manages.

School Admin may view and activate/renew through the permitted flow.

### Deletion

Never delete historical subscription records.

---

# 4.3 ActivationGrant

Represents an issued activation/renewal authorization.

### Identity

`activation_grant_id`

### Attributes

- school_id
- subscription_id
- reference/key
- issued_by
- issued_at
- activated_at
- expires_at
- status

### State

```text
ISSUED
ACTIVATED
EXPIRED
REVOKED
```

### Relationship

```text
Subscription 1 ──── N ActivationGrant
School 1 ──── N ActivationGrant
```

### Immutable

After activation:

- issued_at
- issued_by
- original grant reference

remain historically fixed.

---

# 5. IDENTITY & ACCESS DOMAIN

# 5.1 User

Represents an account identity.

### Identity

`user_id`

### Attributes

- first_name
- last_name
- display_name
- login_identifier
- authentication state
- account status
- last_login_at
- created_at
- updated_at

### State

```text
INVITED
ACTIVE
SUSPENDED
INACTIVE
```

Role is deliberately not stored as the sole authority on User.

---

# 5.2 SchoolMembership

Represents a user's relationship with a school.

### Identity

`membership_id`

### Attributes

- user_id
- school_id
- status
- joined_at
- left_at

### State

```text
PENDING
ACTIVE
INACTIVE
ENDED
```

### Cardinality

```text
User 1 ──── N SchoolMembership
School 1 ──── N SchoolMembership
```

This enables a user identity to be associated with a school without conflating identity and academic role.

---

# 5.3 RoleAssignment

Represents a role within a school membership.

### Identity

`role_assignment_id`

### Attributes

- membership_id
- role
- effective_from
- effective_to
- status

### Roles

```text
SOFTWARE_ADMIN
SCHOOL_ADMIN
MODERATOR
HOD
TEACHER
STUDENT
```

### Cardinality

```text
SchoolMembership 1 ──── N RoleAssignment
```

A user may hold multiple compatible roles.

Example:

```text
User
 └── SchoolMembership
      ├── TEACHER
      └── HOD
```

---

# 5.4 StudentProfile

### Identity

`student_profile_id`

### Attributes

- membership_id
- student_id
- admission_number
- status
- admission_date
- graduation_date

### Relationship

```text
SchoolMembership 1 ──── 0..1 StudentProfile
```

A membership may have a StudentProfile only if the user has a Student role.

### Immutable

The student's historical identity and admission record remain preserved.

Current class is **not** the source of truth here.

---

# 5.5 TeacherProfile

### Identity

`teacher_profile_id`

### Attributes

- membership_id
- staff_id
- employment_status
- hire_date
- end_date

### Relationship

```text
SchoolMembership 1 ──── 0..1 TeacherProfile
```

A teacher's operational history remains attached to their profile even after deactivation.

---

# 6. ACADEMIC STRUCTURE DOMAIN

# 6.1 AcademicSession

### Identity

`academic_session_id`

### Attributes

- school_id
- name
- start_date
- end_date
- status

### State

```text
DRAFT
UPCOMING
CURRENT
CLOSED
ARCHIVED
```

### Invariant

Only one session per school may be `CURRENT`.

### Relationships

```text
School 1 ──── N AcademicSession
AcademicSession 1 ──── N AcademicTerm
AcademicSession 1 ──── N ClassGroup
```

---

# 6.2 AcademicTerm

### Identity

`academic_term_id`

### Attributes

- academic_session_id
- name
- sequence
- start_date
- end_date
- status

### State

```text
DRAFT
ACTIVE
CLOSED
ARCHIVED
```

### Relationship

```text
AcademicSession 1 ──── N AcademicTerm
```

---

# 6.3 Department

### Identity

`department_id`

### Attributes

- school_id
- name
- code
- status

### State

```text
ACTIVE
INACTIVE
```

### Relationship

```text
School 1 ──── N Department
```

Historical department identity is preserved.

---

# 6.4 ClassGroup

Represents an actual class/arm in a specific academic session.

### Identity

`class_id`

### Attributes

- school_id
- academic_session_id
- department_id
- name
- level
- arm
- status

### Example

```text
SS2A
Science
2026/2027
```

### State

```text
ACTIVE
INACTIVE
ARCHIVED
```

### Relationships

```text
AcademicSession 1 ──── N ClassGroup
Department 1 ──── N ClassGroup
ClassGroup 1 ──── N StudentEnrollment
ClassGroup 1 ──── N ClassSubject
```

---

# 6.5 Subject

### Identity

`subject_id`

### Attributes

- school_id
- name
- code
- status

### State

```text
ACTIVE
INACTIVE
```

### Important

Subject can exist across multiple sessions.

Its actual delivery to a class is represented by `ClassSubject`.

---

# 6.6 ClassSubject

Represents a subject being offered to a specific class.

### Identity

`class_subject_id`

### Attributes

- class_id
- subject_id
- academic_session_id
- status

### Relationship

```text
ClassGroup 1 ──── N ClassSubject
Subject 1 ──── N ClassSubject
```

This becomes the authorization scope for teachers.

---

# 6.7 StudentEnrollment

Represents the student's academic placement during a session.

### Identity

`enrollment_id`

### Attributes

- student_profile_id
- academic_session_id
- class_id
- department_id
- start_date
- end_date
- status

### State

```text
ACTIVE
TRANSFERRED
COMPLETED
WITHDRAWN
```

### Cardinality

```text
StudentProfile 1 ──── N StudentEnrollment
ClassGroup 1 ──── N StudentEnrollment
```

This preserves class history.

---

# 6.8 TeacherAssignment

Represents what a teacher is permitted to teach/manage.

### Identity

`teacher_assignment_id`

### Attributes

- teacher_profile_id
- class_subject_id
- academic_session_id
- start_date
- end_date
- status

### State

```text
ACTIVE
ENDED
```

### Relationship

```text
TeacherProfile 1 ──── N TeacherAssignment
ClassSubject 1 ──── N TeacherAssignment
```

### Authorization rule

Teacher permissions for:

- Question creation
- Question management
- Exam creation
- Exam results
- Exam control

must be validated against relevant TeacherAssignment records.

---

# 6.9 HODAssignment

### Identity

`hod_assignment_id`

### Attributes

- user/membership
- department_id
- academic_session_id
- start_date
- end_date
- status

### State

```text
ACTIVE
ENDED
```

### Relationship

```text
Department 1 ──── N HODAssignment
```

### Authorization rule

HOD review and departmental oversight are limited to their active assignment scope.

---

# 7. ASSESSMENT CONTENT DOMAIN

# 7.1 Question

Represents the logical identity of a reusable question.

### Identity

`question_id`

### Attributes

- school_id
- subject_id
- author_teacher_id
- current_status
- created_at
- archived_at

### State

Derived primarily from its current/latest revision and lifecycle.

### Relationship

```text
Question 1 ──── N QuestionRevision
```

The logical question is not the exact version shown to students.

---

# 7.2 QuestionRevision

Represents a specific version.

### Identity

`question_revision_id`

### Attributes

- question_id
- revision_number
- question_type
- content
- topic
- subtopic
- difficulty
- marks
- explanation
- created_by
- created_at
- status

### State

```text
DRAFT
SUBMITTED
UNDER_REVIEW
APPROVED
REJECTED
ARCHIVED
```

### Immutable after approval

At minimum:

- revision_number
- approved content
- approved options
- correct answer
- marks
- approval decision
- approved_at

Any substantive change creates a new revision.

---

# 7.3 QuestionOption

### Identity

`question_option_id`

### Attributes

- question_revision_id
- content
- original_order
- correct_flag

### Relationship

```text
QuestionRevision 1 ──── N QuestionOption
```

Option order presented to a student may differ from `original_order`.

---

# 7.4 QuestionMedia

### Identity

`question_media_id`

### Attributes

- question_revision_id
- media_asset_id
- display_order
- media_type

### Relationship

```text
QuestionRevision 1 ──── N QuestionMedia
```

---

# 7.5 QuestionReview

Represents an immutable academic decision.

### Identity

`question_review_id`

### Attributes

- question_revision_id
- reviewer
- decision
- comment
- reviewed_at

### Decisions

```text
APPROVED
REJECTED
REQUEST_CHANGES
```

### Relationship

```text
QuestionRevision 1 ──── N QuestionReview
```

One revision may have multiple review events.

---

# 8. EXAMINATION DOMAIN

# 8.1 Exam

Represents the assessment itself.

### Identity

`exam_id`

### Attributes

- school_id
- academic_session_id
- academic_term_id
- class_id
- subject_id
- department_id
- title
- exam_type
- instructions
- duration_seconds
- attempt_limit
- navigation_policy
- randomize_questions
- randomize_options
- result_policy
- created_by
- status

### State

```text
DRAFT
READY
OPEN
CLOSED
COMPLETED
ARCHIVED
CANCELLED
```

### Key invariant

Only an exam in `READY` state can transition to `OPEN`.

---

# 8.2 ExamSection

Optional structural layer.

### Identity

`exam_section_id`

### Attributes

- exam_id
- title
- sequence
- instructions
- marks

### Relationship

```text
Exam 1 ──── N ExamSection
```

A simple exam may have one implicit/default section.

---

# 8.3 ExamQuestion

Links an approved question revision to an exam.

### Identity

`exam_question_id`

### Attributes

- exam_id
- exam_section_id
- question_revision_id
- sequence
- marks

### Relationship

```text
Exam 1 ──── N ExamQuestion
QuestionRevision 1 ──── N ExamQuestion
```

### Critical invariant

`question_revision_id` must point to an approved revision.

Once the exam becomes operational, the relationship is effectively immutable.

---

# 8.4 ExamSession

Represents an administration sitting.

### Identity

`exam_session_id`

### Attributes

- exam_id
- session_type
- opened_by
- opened_at
- closed_by
- closed_at
- location
- notes
- status

### Session types

```text
STANDARD
BATCH
MAKEUP
SPECIAL
```

### State

```text
READY
OPEN
CLOSED
COMPLETED
CANCELLED
```

### Relationship

```text
Exam 1 ──── N ExamSession
```

One examination may therefore have:

```text
Exam
├── Batch 1
├── Batch 2
└── Makeup
```

without becoming three examinations.

---

# 8.5 ExamSessionParticipant

Represents a student authorized to participate in a specific session.

### Identity

`session_participant_id`

### Attributes

- exam_session_id
- student_profile_id
- authorization_state
- authorized_by
- authorized_at
- status

### State

```text
AUTHORIZED
REVOKED
COMPLETED
CANCELLED
```

### Relationship

```text
ExamSession 1 ──── N ExamSessionParticipant
StudentProfile 1 ──── N ExamSessionParticipant
```

---

# 9. EXECUTION DOMAIN

# 9.1 ExamAttempt

Represents an actual student attempt.

### Identity

`attempt_id`

### Attributes

- exam_id
- exam_session_id
- student_profile_id
- attempt_number
- attempt_type
- started_at
- duration_granted_seconds
- expires_at
- submitted_at
- state
- participation_status
- invalidation_reason

### Attempt type

```text
STANDARD
MAKEUP
RETRY
SPECIAL
```

### Attempt state

```text
NOT_STARTED
IN_PROGRESS
SUBMITTED
AUTO_SUBMITTED
INVALIDATED
CANCELLED
```

### Participation status

```text
PENDING
IN_PROGRESS
COMPLETED
ABSENT
EXCUSED
```

### Critical invariants

1. A student cannot have more completed attempts than the exam's configured attempt policy permits.
2. A completed attempt cannot be restarted normally.
3. `expires_at` is calculated from the attempt's granted duration.
4. Disconnecting does not reset the timer.
5. An absent student has no attempt unless they later receive authorized access.

---

# 9.2 AttemptQuestionSnapshot

This is critical for examination integrity.

### Identity

`attempt_question_snapshot_id`

### Attributes

- attempt_id
- exam_question_id
- question_revision_id
- display_sequence
- question_content_snapshot
- options_snapshot
- correct_answer_snapshot
- marks_snapshot

### Purpose

Preserves exactly what was presented to the student.

### Immutable

Once an attempt starts, the snapshot should be immutable.

---

# 9.3 AttemptAnswer

### Identity

`attempt_answer_id`

### Attributes

- attempt_id
- attempt_question_snapshot_id
- selected_option_reference
- answer_value
- answered_at
- last_saved_at
- state

### State

```text
UNANSWERED
ANSWERED
```

### Important rule

The latest saved answer is not overwritten in a way that destroys historical audit context if audit-grade answer history is required.

At minimum, final submitted state must remain reconstructable.

---

# 9.4 AttemptQuestionResult

Represents marking of one question.

### Identity

`attempt_question_result_id`

### Attributes

- attempt_id
- attempt_question_snapshot_id
- awarded_marks
- maximum_marks
- correctness
- marking_status

### Correctness

```text
CORRECT
INCORRECT
UNANSWERED
PARTIAL
```

`PARTIAL` allows future support for question types that support partial marking.

---

# 9.5 ExamParticipation

Represents the student's participation/attendance outcome independently of attempt state.

### Identity

`exam_participation_id`

### Attributes

- exam_id
- exam_session_id
- student_profile_id
- status
- recorded_by
- recorded_at
- notes

### State

```text
PENDING
ATTENDED
ABSENT
EXCUSED
```

This is the authoritative participation record.

---

# 9.6 MakeupAuthorization

### Identity

`makeup_authorization_id`

### Attributes

- exam_id
- student_profile_id
- authorized_by
- reason
- authorized_at
- expires_at
- status

### State

```text
AUTHORIZED
USED
REVOKED
EXPIRED
```

### Relationship

```text
Exam 1 ──── N MakeupAuthorization
StudentProfile 1 ──── N MakeupAuthorization
```

### Important rule

Makeup authorization creates another attempt; it does not modify the original absence.

---

# 9.7 StudentAssessmentAccommodation

### Identity

`accommodation_id`

### Attributes

- student_profile_id
- exam_id or policy scope
- type
- value
- approved_by
- effective_from
- effective_to
- status

### Examples

```text
EXTENDED_TIME
LARGER_TEXT
ACCESSIBILITY_MODE
```

This is explicitly authorized and should never be self-selected by a student.

---

# 10. RESULT DOMAIN

# 10.1 Result

### Identity

`result_id`

### Attributes

- attempt_id
- student_profile_id
- exam_id
- total_marks
- earned_marks
- percentage
- grade
- correct_count
- incorrect_count
- unanswered_count
- state
- finalized_at
- published_at

### State

```text
PROCESSING
FINAL
PUBLISHED
UNPUBLISHED
ADJUSTED
```

### Relationship

```text
ExamAttempt 1 ──── 1 Result
```

A result cannot exist without an attempt.

---

# 10.2 ResultAdjustment

### Identity

`result_adjustment_id`

### Attributes

- result_id
- adjustment_type
- reason
- old_value
- new_value
- authorized_by
- created_at

### Types

```text
VOID_QUESTION
AWARD_MARK
DEDUCT_MARK
RECALCULATE
MANUAL_OVERRIDE
```

### Important

A result adjustment is an event, not a silent overwrite.

---

# 10.3 ResultPublication

### Identity

`result_publication_id`

### Attributes

- result/result scope
- published_by
- published_at
- status

### State

```text
PUBLISHED
UNPUBLISHED
```

Publication controls visibility; it does not change academic scoring.

---

# 11. OPERATIONS DOMAIN

# 11.1 AuditEvent

### Identity

`audit_event_id`

### Attributes

- school_id
- actor_user_id
- actor_role
- action
- entity_type
- entity_id
- reason
- occurred_at
- contextual metadata

### Examples

```text
QUESTION_APPROVED
QUESTION_REJECTED
EXAM_READY
EXAM_OPENED
EXAM_CLOSED
MAKEUP_GRANTED
ATTEMPT_INVALIDATED
RESULT_PUBLISHED
RESULT_ADJUSTED
USER_DEACTIVATED
CLASS_CHANGED
TEACHER_ASSIGNED
```

### Immutability

Audit events are append-only.

---

# 11.2 Notification

### Identity

`notification_id`

### Attributes

- school_id
- recipient_user_id
- type
- title
- content
- created_at
- read_at
- related_entity

### State

```text
UNREAD
READ
```

---

# 11.3 MediaAsset

### Identity

`media_asset_id`

### Attributes

- school_id
- type
- storage_reference
- original_filename
- mime_type
- size
- uploaded_by
- created_at

### Types

```text
SCHOOL_LOGO
QUESTION_IMAGE
QUESTION_DIAGRAM
REPORT
OTHER
```

---

# 12. CANONICAL ERD

The central relationship graph is:

```text
┌──────────────────────┐
│       SCHOOL         │
└──────────┬───────────┘
           │
    ┌──────┼───────────────────────────────────────────┐
    │      │                                           │
    ▼      ▼                                           ▼
Subscription   AcademicSession                     Membership
                  │                                  │
                  ▼                                  ▼
                Term                           RoleAssignment
                  │
       ┌──────────┼───────────┐
       ▼          ▼           ▼
 Department    Class       Subject
                   │           │
                   └─────┬─────┘
                         ▼
                   ClassSubject
                    │        │
             ┌──────┘        └──────┐
             ▼                      ▼
     StudentEnrollment       TeacherAssignment
             │                      │
             ▼                      ▼
       StudentProfile         TeacherProfile


QUESTION DOMAIN

Question
   │
   ▼
QuestionRevision
   ├────────► QuestionOption
   ├────────► QuestionMedia
   └────────► QuestionReview


EXAM DOMAIN

Exam
 ├────────► ExamSection
 ├────────► ExamQuestion ───────► QuestionRevision
 └────────► ExamSession
                 │
                 ▼
        ExamSessionParticipant
                 │
                 ▼
             ExamAttempt
                 │
       ┌─────────┼────────────┐
       ▼         ▼            ▼
AttemptSnapshot Answers   Participation
       │         │
       ▼         ▼
QuestionResult
       │
       ▼
     Result
       │
       ├────► ResultAdjustment
       └────► ResultPublication
```

---

# 13. Cardinality Summary

| Relationship                       | Cardinality |
| ---------------------------------- | ----------- |
| School → Subscription              | 1:N         |
| School → Membership                | 1:N         |
| Membership → RoleAssignment        | 1:N         |
| School → AcademicSession           | 1:N         |
| AcademicSession → AcademicTerm     | 1:N         |
| School → Department                | 1:N         |
| AcademicSession → ClassGroup       | 1:N         |
| ClassGroup → ClassSubject          | 1:N         |
| Subject → ClassSubject             | 1:N         |
| StudentProfile → StudentEnrollment | 1:N         |
| TeacherProfile → TeacherAssignment | 1:N         |
| Department → HODAssignment         | 1:N         |
| Question → QuestionRevision        | 1:N         |
| QuestionRevision → QuestionOption  | 1:N         |
| QuestionRevision → QuestionReview  | 1:N         |
| Exam → ExamQuestion                | 1:N         |
| Exam → ExamSession                 | 1:N         |
| ExamSession → Participant          | 1:N         |
| ExamSessionParticipant → Attempt   | 1:0..N      |
| ExamAttempt → Snapshot             | 1:N         |
| ExamAttempt → Answer               | 1:N         |
| ExamAttempt → QuestionResult       | 1:N         |
| ExamAttempt → Result               | 1:1         |
| Result → Adjustment                | 1:N         |

---

# 14. EXAM STATE MACHINE

## 14.1 Exam creation

```text
DRAFT
  │
  │ Validate
  ▼
READY
  │
  │ Open for students
  ▼
OPEN
  │
  │ Close new attempts
  ▼
CLOSED
  │
  │ Finish administration
  ▼
COMPLETED
  │
  │ Archive
  ▼
ARCHIVED
```

Cancellation:

```text
DRAFT ─────► CANCELLED
READY ─────► CANCELLED
```

An `OPEN` exam may be cancelled only through a controlled administrative workflow because students may already have attempts.

---

# 15. EXAM SESSION STATE MACHINE

```text
READY
  │
  │ Open
  ▼
OPEN
  │
  │ Close
  ▼
CLOSED
  │
  │ Finalize
  ▼
COMPLETED
```

A session may be cancelled where there are no finalized attempts or through controlled exception handling.

---

# 16. ATTEMPT STATE MACHINE

```text
NOT_STARTED
     │
     │ Student starts
     ▼
IN_PROGRESS
     │
     ├──────────────► SUBMITTED
     │
     ├──────────────► AUTO_SUBMITTED
     │
     ├──────────────► INVALIDATED
     │
     └──────────────► CANCELLED
```

There is no ordinary transition:

```text
SUBMITTED → IN_PROGRESS
```

An exceptional new attempt requires explicit authorization and creates a new attempt record.

---

# 17. PARTICIPATION STATE MACHINE

```text
PENDING
  │
  ├────► ATTENDED
  │
  ├────► ABSENT
  │
  └────► EXCUSED
```

`ATTENDED` can coexist with:

- Submitted
- Auto-submitted
- Invalidated

because participation and attempt state are intentionally separate.

---

# 18. QUESTION REVISION STATE MACHINE

```text
DRAFT
  │
  │ Submit
  ▼
SUBMITTED
  │
  ▼
UNDER_REVIEW
  │
  ├────────► APPROVED
  │
  └────────► REJECTED
                    │
                    │ Revise
                    ▼
                   DRAFT
```

Approved revisions are immutable.

A substantive edit creates a new revision.

---

# 19. RESULT STATE MACHINE

```text
PROCESSING
     │
     ▼
FINAL
     │
     ▼
PUBLISHED
```

Publication reversal:

```text
PUBLISHED → UNPUBLISHED
```

Correction:

```text
FINAL/PUBLISHED → ADJUSTED
```

An adjustment does not erase the original result state.

---

# 20. THE CANONICAL EXAMINATION TRANSACTION

This is the most important workflow in the entire system.

## Phase 1 — Exam readiness

```text
Exam DRAFT
   ↓
Validate
   ↓
All required conditions satisfied
   ↓
Exam READY
```

### Validation includes

- School active
- Session valid
- Term valid
- Class active
- Subject active
- Exam type configured
- Instructions configured
- Duration configured
- Questions selected
- All selected revisions approved
- No invalid question references
- Eligible students exist
- Result policy valid

Only after all mandatory checks pass:

**DRAFT → READY**

---

# 21. Phase 2 — Open an Exam Session

Teacher/Moderator/HOD/School Admin with appropriate authority chooses:

**Open for Students**

The system creates:

```text
ExamSession
status = OPEN
```

The parent `Exam` becomes:

```text
OPEN
```

if it was `READY`.

The exam does not receive a global countdown.

---

# 22. Phase 3 — Authorize Students

Students may already be eligible by class membership, but operationally the session can control who is currently allowed to start.

For each student:

```text
ExamSessionParticipant
```

is created or activated.

Example:

```text
40 students
↓
20 authorized
↓
20 waiting
```

The first 20 see the assessment.

---

# 23. Phase 4 — Student Starts

Student opens the assessment.

System validates again:

- Account active
- School correct
- Class still eligible
- Exam still open
- No completed attempt
- Authorization valid
- No conflicting attempt

Then:

```text
ExamAttempt = created
state = IN_PROGRESS
started_at = current time
expires_at = started_at + duration
```

This is where the student's individual timer starts.

---

# 24. Phase 5 — Build the Attempt Snapshot

Immediately when the attempt starts, the system freezes the exact assessment presentation.

For each exam question:

```text
ExamQuestion
    ↓
AttemptQuestionSnapshot
```

The snapshot records:

- Exact question version
- Exact content
- Exact options
- Marks
- Display order
- Randomized option order
- Correct answer reference needed for marking

After creation, the snapshot is immutable.

---

# 25. Phase 6 — Student Answers

The student answers questions.

Each change results in an updated:

```text
AttemptAnswer
```

The platform maintains the latest valid answer state.

The product requirement is:

> **The student's progress survives temporary connection failures.**

---

# 26. Phase 7A — Normal Submission

Student selects:

**Submit**

System shows confirmation.

If confirmed:

```text
Attempt
IN_PROGRESS
   ↓
SUBMITTED
```

The submission timestamp is recorded.

The attempt becomes non-editable.

---

# 27. Phase 7B — Timer Expiry

If:

```text
current_time >= expires_at
```

the system automatically transitions:

```text
IN_PROGRESS
   ↓
AUTO_SUBMITTED
```

The last valid persisted answers are finalized.

No additional student interaction is required.

---

# 28. Phase 8 — Marking

The system evaluates each:

```text
AttemptQuestionSnapshot
+
AttemptAnswer
```

and creates:

```text
AttemptQuestionResult
```

For each question:

```text
Correct
Incorrect
Unanswered
```

Then:

```text
Question scores
      ↓
Total marks
      ↓
Percentage
      ↓
Grade if configured
```

---

# 29. Phase 9 — Result Finalization

A Result is created:

```text
Result
state = PROCESSING
```

After all marking completes:

```text
PROCESSING
    ↓
FINAL
```

The final result references the immutable attempt.

---

# 30. Phase 10 — Result Publication

If school policy is:

**Teacher publishes**

the result remains:

```text
FINAL
```

until the teacher publishes.

Then:

```text
FINAL
 ↓
PUBLISHED
```

The student can now access the result.

If the school's policy is automatic publication:

```text
FINAL → PUBLISHED
```

immediately after successful finalization.

---

# 31. Complete Transaction Graph

```text
EXAM DRAFT
    │
    ▼
VALIDATION
    │
    ▼
EXAM READY
    │
    ▼
EXAM SESSION OPEN
    │
    ▼
STUDENT AUTHORIZED
    │
    ▼
ATTEMPT CREATED
    │
    ▼
QUESTION SNAPSHOTS CREATED
    │
    ▼
ANSWERS PERSISTED
    │
    ├───────────────┐
    ▼               ▼
SUBMITTED       TIME EXPIRED
    │               │
    └───────┬───────┘
            ▼
       ATTEMPT FINALIZED
            │
            ▼
      QUESTION MARKING
            │
            ▼
      QUESTION RESULTS
            │
            ▼
         RESULT
            │
            ▼
          FINAL
            │
            ▼
       PUBLICATION
            │
            ▼
          STUDENT
          RESULTS
```

---

# 32. Batch Examination Transaction

For a physical CBT lab:

```text
EXAM
 │
 ├── SESSION 1
 │    ├── Student 1 → Attempt
 │    ├── Student 2 → Attempt
 │    └── ...
 │
 ├── SESSION 2
 │    ├── Student 21 → Attempt
 │    ├── Student 22 → Attempt
 │    └── ...
 │
 └── MAKEUP SESSION
      ├── Student 39 → Attempt
      └── Student 40 → Attempt
```

All attempts point back to the same:

**Exam**

Therefore reporting remains:

> Mathematics First Term Examination — 40 students.

not:

> Three unrelated exams.

---

# 33. ABSENT STUDENT TRANSACTION

Suppose Ahmed never starts.

At session close:

```text
ExamParticipation
status = ABSENT
```

There is:

```text
No ExamAttempt
No Result
```

Later:

```text
MakeupAuthorization
      ↓
Makeup ExamSession
      ↓
ExamSessionParticipant
      ↓
ExamAttempt
      ↓
Result
```

The original absence remains.

---

# 34. RESULT CORRECTION TRANSACTION

Suppose Question 17 is invalid.

Do not modify historical answers directly.

Instead:

```text
Result
   ↓
ResultAdjustment
   ↓
Void Question 17
   ↓
Recalculate
   ↓
Adjusted Result
```

Audit event:

```text
RESULT_ADJUSTED
```

records:

- who
- why
- what changed
- when

---

# 35. STUDENT CLASS CHANGE

Suppose:

```text
Ahmed
2026/2027
SS2A
```

moves to:

```text
SS2B
```

The old `StudentEnrollment` remains historically recorded.

A new effective assignment/context is created.

Old exams continue to show:

```text
SS2A
```

even after Ahmed's current class becomes:

```text
SS2B
```

---

# 36. TEACHER REASSIGNMENT

Suppose Mr Ade originally teaches Mathematics SS2A.

His assignment ends.

A new teacher is assigned.

Historical data remains:

```text
Exam created by Mr Ade
Question created by Mr Ade
```

New operational control may belong to the new teacher.

Ownership history is not rewritten.

---

# 37. QUESTION REVISION + EXAM IMMUTABILITY

Suppose:

```text
Question Q100
Revision 2 = Approved
```

Exam uses Revision 2.

Later teacher creates:

```text
Revision 3
```

The old exam still references:

```text
Revision 2
```

The new revision can be used only in a future or still-draft exam according to its state.

This prevents retroactive exam mutation.

---

# 38. Immutable Data Matrix

| Entity                | Immutable after operational use |
| --------------------- | ------------------------------- |
| School                | School identity                 |
| Subscription          | Historical subscription facts   |
| Academic Session      | Historical identity             |
| StudentEnrollment     | Historical placement            |
| TeacherAssignment     | Historical assignment           |
| QuestionRevision      | Approved revision content       |
| QuestionReview        | Review decision/history         |
| ExamQuestion          | Used question revision binding  |
| ExamSession           | Historical session events       |
| ExamAttempt           | Submitted attempt facts         |
| AttemptSnapshot       | Entire presented question state |
| AttemptAnswer         | Final submitted answer          |
| AttemptQuestionResult | Final marking evidence          |
| Result                | Original finalized result       |
| AuditEvent            | Entire record                   |
| ResultAdjustment      | Historical adjustment event     |

---

# 39. Mutable Data Matrix

| Entity                       | Generally mutable                |
| ---------------------------- | -------------------------------- |
| School branding              | Yes                              |
| User contact/profile data    | Yes                              |
| Upcoming class configuration | Yes                              |
| Teacher assignments          | Until effective period ends      |
| Draft QuestionRevision       | Yes                              |
| Draft Exam                   | Yes                              |
| Ready Exam                   | Limited                          |
| Active Exam                  | Highly restricted                |
| Result publication status    | Yes, through controlled workflow |
| Notification read state      | Yes                              |

---

# 40. Archive Rules

## Questions

Approved/used questions:

**Archive**, don't delete.

## Exams

Completed exams:

**Archive**, don't delete.

## Users

Graduated/departed:

**Deactivate/Graduate**, don't delete.

## Departments

Historical:

**Deactivate**, don't delete.

## Subjects

Historical:

**Deactivate**, don't delete.

## Sessions

Completed:

**Close → Archive**.

---

# 41. Permission Binding to the Data Model

The permission model is now enforceable through relationships.

### Teacher

Must have:

```text
TeacherProfile
+
Active TeacherAssignment
```

to manage a question/exam within a class subject.

### HOD

Must have:

```text
HODAssignment
+
Department scope
```

to review questions or view departmental academic data.

### Moderator

Requires active:

```text
MODERATOR RoleAssignment
+
SchoolMembership
```

to perform school operational actions.

### School Admin

Requires:

```text
SCHOOL_ADMIN RoleAssignment
```

within the target school.

### Software Admin

Does not belong to a normal school tenant for authority purposes.

Their role is platform-wide.

---

# 42. Core Invariants

These are now **canonical business invariants**.

## Invariant 1 — Tenant isolation

A school-owned object cannot reference another school's object.

## Invariant 2 — Current session uniqueness

One school cannot have two simultaneous CURRENT sessions.

## Invariant 3 — Teacher scope

A teacher cannot manage academic records outside active assignment scope.

## Invariant 4 — HOD scope

An HOD cannot approve outside assigned department scope.

## Invariant 5 — Approved question requirement

An executable exam can only contain approved question revisions.

## Invariant 6 — Historical question integrity

An attempt references its exact question snapshot.

## Invariant 7 — Timer integrity

Attempt expiry is independent for each student.

## Invariant 8 — No silent reattempt

A submitted attempt is never reopened.

## Invariant 9 — Absence is not a score

No attempt means no automatic zero result.

## Invariant 10 — Makeup preserves history

Makeup does not overwrite original participation.

## Invariant 11 — Result provenance

Every result must trace to an attempt.

## Invariant 12 — Result correction is auditable

No silent score changes.

## Invariant 13 — Historical academic context

Changing current class/department never rewrites old exam context.

## Invariant 14 — Subscription does not delete data

Expired access does not destroy academic history.

## Invariant 15 — Audit is append-only

Audit records cannot be altered through ordinary product operations.

---

# 43. Final Canonical Data Architecture

The complete conceptual model is now:

```text
                           ┌─────────────┐
                           │    SCHOOL   │
                           └──────┬──────┘
                                  │
         ┌────────────────────────┼─────────────────────────┐
         │                        │                         │
         ▼                        ▼                         ▼
  SUBSCRIPTION              IDENTITY                   ACADEMICS
         │                        │                         │
         │                 ┌──────┴──────┐          ┌───────┴────────┐
         │                 │             │          │                │
         │              MEMBERSHIP     ROLES      SESSION         STRUCTURE
         │                                             │
         │                                             ▼
         │                                           TERMS
         │
         │                         ┌────────────────────────────┐
         │                         │                            │
         │                         ▼                            ▼
         │                    STUDENTS                    TEACHERS
         │                         │                            │
         │                    ENROLLMENT                   ASSIGNMENT
         │                         │                            │
         │                         └──────────┬─────────────────┘
         │                                    │
         │                                    ▼
         │                              CLASS SUBJECT
         │
         └────────────────────────────────────────────────────────
                                      │
                                      ▼
                              QUESTION DOMAIN
                                      │
                           ┌──────────┴──────────┐
                           ▼                     ▼
                       QUESTION             REVISIONS
                                                 │
                                      ┌──────────┼──────────┐
                                      ▼          ▼          ▼
                                   OPTIONS     MEDIA     REVIEWS
                                                 │
                                                 ▼
                                            EXAM DOMAIN
                                                 │
                                      ┌──────────┴──────────┐
                                      ▼                     ▼
                                     EXAM               EXAM SESSION
                                      │                     │
                                      ▼                     ▼
                                EXAM QUESTION        PARTICIPANTS
                                      │                     │
                                      └──────────┬──────────┘
                                                 ▼
                                             ATTEMPT
                                                 │
                              ┌──────────────────┼──────────────────┐
                              ▼                  ▼                  ▼
                           SNAPSHOT            ANSWER        QUESTION RESULT
                              │                  │                  │
                              └──────────────────┴──────────┬───────┘
                                                           ▼
                                                         RESULT
                                                           │
                                             ┌─────────────┴────────────┐
                                             ▼                          ▼
                                      PUBLICATION                 ADJUSTMENT
```

---

# 44. Final Product/Data Model Decision

At this point, I would consider the **domain model locked** unless we encounter a genuinely new product requirement.

The most important decisions we've settled are:

1. **School is the tenant.**
2. **User identity is separate from school membership and role.**
3. **Academic placement is historical, not a single mutable class field.**
4. **Teacher/HOD authority comes from explicit assignments.**
5. **Questions have immutable revisions.**
6. **Exams reference approved question revisions.**
7. **Exam sessions represent physical administration batches.**
8. **Attempts are individually timed.**
9. **Attempt snapshots preserve exactly what each student saw.**
10. **Answers are the evidence; results are the derived conclusion.**
11. **Absence is separate from attempts and scores.**
12. **Makeup is a new attempt against the same examination.**
13. **Result adjustments are explicit audited events.**
14. **Historical records are preserved rather than overwritten.**
15. **Audit events are append-only.**

This is the point at which the product can safely transition into **technical architecture**.

The architecture phase should now map these domains into concrete services/modules, database boundaries, transaction boundaries, API contracts, caching and offline behaviour, authentication/authorization, file storage, background processing, deployment topology, observability, security, backup/recovery, and scaling strategy—without changing the business model we've established here.
