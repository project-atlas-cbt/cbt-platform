# CBT Platform — Functional Requirements & Behaviour Specification

This becomes the **product requirements layer between the module map and the eventual technical architecture**.

The objective here is to remove ambiguity.

By the time this specification is complete, we should be able to hand it to a designer and say:

> “Design these screens.”

And hand it to an engineering team later and say:

> “Build these behaviours.”

without having to reinvent the product while coding.

---

# 1. Product Operating Principles

Before individual modules, these rules apply across the entire system.

### 1.1 Multi-school isolation

Every school is an independent environment.

A user from School A must never see:

- School B students
- School B questions
- School B exams
- School B results
- School B settings

unless that user is explicitly operating at Software Admin level.

---

### 1.2 Role + scope determine access

A role alone is insufficient.

Access is determined by:

**Role + School + Academic Session + Department/Class/Subject assignment + Ownership + Record state**

Example:

A Mathematics Teacher may create questions, but only for the Mathematics classes assigned to them.

---

### 1.3 Historical records are preserved

The platform must never casually rewrite historical academic facts.

If a student moves from SS2A to SS2B, old exams remain attached to the context in which they occurred.

If a teacher leaves, their old questions remain attributed to them.

---

### 1.4 State transitions matter

Important entities are stateful:

- School
- User
- Question
- Exam
- Attempt
- Result
- Academic Session

Actions available to users depend on the current state.

---

### 1.5 Deletion is mostly archival/deactivation

For academic entities, the default pattern is:

> **Deactivate / Archive / Cancel**

rather than destructive deletion.

We should avoid deleting records that have historical significance.

---

# 2. PLATFORM MODULE

## 2.1 Software Admin → Dashboard

### Purpose

Platform-wide operational overview.

### Screen

**SA-01 — Platform Dashboard**

Shows:

- Total schools
- Active schools
- Suspended schools
- Expired schools
- Students
- Teachers
- Exams
- Attempts
- Recent platform activity
- Subscription metrics
- Schools requiring attention

### Actions

Software Admin can:

- Open school
- Search school
- Filter metrics
- Navigate to subscription management
- Open audit activity

### Edge cases

If platform has no schools:

> “No schools have been onboarded yet.”

If metrics fail:

> Dashboard should show partial data rather than a blank page.

---

# 3. SCHOOL MANAGEMENT

## 3.1 School List

**SA-02 — Schools**

### Actions

- Search
- Filter
- Sort
- Open school
- Create school
- Activate
- Suspend
- Renew
- View subscription

### Filters

- Active
- Provisional
- Suspended
- Expired
- Deactivated

---

## 3.2 Create School

**SA-03 — Create School**

Required:

- School name
- Admin name
- Admin email/identifier
- Subscription
- Initial subscription period

System generates:

- School identifier
- Activation mechanism
- Initial admin account/invitation

### Validation

School identifier must be unique.

School name may not need to be globally unique, but duplicated names should be permitted only with a unique internal identifier.

---

## 3.3 School Detail

**SA-04 — School Overview**

Sections:

- Overview
- Subscription
- Users
- Exams
- Usage
- Activity
- Audit

### Important rule

Software Admin can inspect school-level information, but sensitive academic modifications should be restricted and audited.

---

# 4. SUBSCRIPTION MODULE

## 4.1 Subscription Screen

**SA-05 — Subscription**

Displays:

- Plan
- Status
- Start date
- Expiry date
- Renewal history
- Activation history
- Current subscription key/reference
- Grace state where applicable

### States

```text
ACTIVE
EXPIRING_SOON
EXPIRED
SUSPENDED
```

---

## 4.2 Expiration behaviour

Before expiration:

- Admin warning
- School notification
- Platform notification

After expiration:

- Existing academic data remains
- No data destruction
- New assessment activity may be blocked according to policy
- School enters restricted state
- Renewal restores access

### Important

We should not design the system so expiration can corrupt an active attempt.

---

# 5. SCHOOL ONBOARDING MODULE

## 5.1 Setup Wizard

**ON-01 → ON-10**

### Step 1: School profile

Required:

- Name
- Contact details

Optional:

- Motto
- Address
- Website
- Phone

### Step 2: Branding

- Logo upload
- Primary colour
- Theme preview
- Save branding

### Step 3: Academic session

- Session name
- Start
- End

### Step 4: Terms

- First
- Second
- Third
- Custom term names if needed

### Step 5: Departments

Add/edit/remove/deactivate.

### Step 6: Classes

Create/import classes.

### Step 7: Subjects

Create/import subjects.

### Step 8: Staff

Create/import:

- Moderators
- HODs
- Teachers

### Step 9: Students

Import/add students.

### Step 10: Review

Summary:

```text
School
Branding
Session
Departments
Classes
Subjects
Staff
Students
```

Then:

**Complete Setup**

---

## 5.2 Onboarding validations

The school cannot finish setup if required fundamentals are missing.

Example:

- No current academic session
- No active school administrator
- No class
- Invalid department
- Duplicate class identifiers

However, not every school must have every role created before completion.

A school should be able to finish with:

> one admin + academic structure

and add staff later.

---

# 6. BRANDING MODULE

## 6.1 Branding screen

**SET-01 — Branding**

Inputs:

- Logo
- Primary colour

Preview:

- Login
- Dashboard
- Buttons
- Tables
- Exam interface
- Results

### Validation

Colour must be a valid supported colour value.

Logo:

- Supported image types
- File-size restriction
- Minimum/maximum dimensions
- Clear preview
- Ability to replace

### Rules

Changing logo does not affect historical reports.

Changing colour does not alter stored academic data.

---

# 7. ACADEMIC STRUCTURE MODULE

This module is shared by School Admin and Moderator, within permission scope.

---

## 7.1 Academic Sessions

**AC-01 — Sessions**

Actions:

- Create
- Edit upcoming session
- Activate
- Archive
- View history

### Rule

Only one session may be **CURRENT**.

### States

```text
DRAFT
UPCOMING
CURRENT
CLOSED
ARCHIVED
```

---

## 7.2 Terms

**AC-02 — Terms**

Each term belongs to a session.

Actions:

- Create
- Edit
- Activate
- Close

Cannot delete a term with historical exams.

---

## 7.3 Departments

**AC-03 — Departments**

Actions:

- Create
- Edit
- Deactivate
- View

A department with historical records cannot be destructively deleted.

---

## 7.4 Classes

**AC-04 — Classes**

Fields:

- Name
- Level
- Arm
- Department
- Session
- Active state

Actions:

- Create
- Edit
- Deactivate
- View students
- View teachers
- View exams

### Validation

Class identity must be unique within its session/school context.

---

## 7.5 Subjects

**AC-05 — Subjects**

Actions:

- Create
- Edit
- Assign department
- Assign classes
- Deactivate

A subject being deactivated must not break historical exams.

---

# 8. USER MANAGEMENT MODULE

This contains four operational user groups:

- Students
- Teachers
- HODs
- Moderators

---

# 9. STUDENT MANAGEMENT

## 9.1 Student List

**USR-S-01**

Columns:

- Student ID
- Name
- Class
- Department
- Status
- Session

Actions:

- Search
- Filter
- Sort
- Export
- Add
- Import
- Open profile

---

## 9.2 Student Profile

**USR-S-02**

Shows:

### Identity

- Name
- Student ID
- Account status

### Academic

- Current class
- Department
- Session
- History

### Assessment

- Exams taken
- Results
- Absences
- Makeup attempts

### Administrative

- Created by
- Created date
- Last active
- Account status

---

## 9.3 Student actions

Authorized admin can:

- Create
- Edit
- Deactivate
- Reactivate
- Reset credentials
- Move class
- View records
- Grant/revoke permitted access

---

## 9.4 Student lifecycle

```text
INVITED
→ ACTIVE
→ SUSPENDED
→ INACTIVE
→ GRADUATED
→ ARCHIVED
```

Not every state needs to be used for every school.

---

# 10. BULK IMPORT

This should be a first-class feature.

## 10.1 Import flow

**IMP-01**

```text
Upload
→ Validate
→ Review errors
→ Confirm
→ Import
→ Summary
```

---

## 10.2 Validation

Check:

- Required fields
- Duplicate IDs
- Duplicate accounts
- Invalid class
- Invalid department
- Invalid session
- Invalid data types

### Important

Never partially import silently.

The user must see exactly what will happen.

Example:

```text
1,500 rows

1,472 valid
18 duplicate IDs
10 invalid class
```

Then:

**Import valid rows**

or

**Cancel / fix file**

---

# 11. TEACHER MANAGEMENT

## 11.1 Teacher Profile

Shows:

- Staff ID
- Name
- Department
- Subjects
- Classes
- Account status
- Exams created
- Questions created
- Activity

### Actions

- Create
- Edit
- Deactivate
- Reset credentials
- Assign subjects
- Assign classes

---

# 12. TEACHER ASSIGNMENT MODULE

## 12.1 Assignment Screen

**USR-T-02**

Teacher selected:

```text
Mr Ade

Subjects
☑ Mathematics
☐ Physics

Classes
☑ SS1A
☑ SS1B
☑ SS2A
```

### Rules

A teacher can only create questions/exams where they have the necessary subject/class assignment.

Changing assignment affects **future operations**, not historical ownership.

---

# 13. HOD MANAGEMENT

HOD record:

- Person
- Department
- Status
- Assignment history

### HOD authority

An HOD's academic review scope follows the department assignment.

When HOD changes:

- Existing approvals remain attributed to the old HOD
- Pending reviews can be reassigned
- New reviews go to the new HOD

---

# 14. MODERATOR MANAGEMENT

School Admin can:

- Create Moderator
- Edit
- Deactivate
- Reset credentials

Moderator handles operational school administration.

The Moderator should not automatically inherit academic approval privileges.

---

# 15. QUESTION BANK MODULE

This is one of the platform's foundational modules.

---

# 15.1 Question Bank Home

**QB-01**

Teacher sees:

```text
My Questions

Draft       12
Submitted    8
Approved   143
Rejected     5
Archived    21
```

HOD sees departmental equivalents.

School Admin sees school-level oversight.

---

# 15.2 Question Types

For the production foundation, I recommend:

### Core

- Single-choice MCQ
- True/False

### Supported content

- Text
- Image
- Rich formatting
- Mathematical notation

### Planned extensibility

The data model should allow future types such as:

- Multiple-select
- Short answer
- Essay
- Matching
- Ordering

But those do not need to be turned on merely because the system supports their future existence.

---

# 15.3 Question Creation

**QB-02 — Create Question**

Fields:

### Academic

- Subject
- Class
- Department
- Topic
- Subtopic
- Difficulty
- Marks

### Content

- Question
- Media
- Options
- Correct answer

### Optional

- Explanation
- Reference/source

---

# 15.4 Question validation

Cannot submit if:

- Question text empty
- Required option missing
- Correct answer missing
- Correct answer references non-existent option
- Subject/class unavailable
- Teacher isn't assigned to that subject/class
- Marks invalid

For MCQ:

> At least two valid options must exist.

---

# 15.5 Question states

```text
DRAFT
SUBMITTED
UNDER_REVIEW
APPROVED
REJECTED
ARCHIVED
```

---

# 16. QUESTION REVIEW

## 16.1 HOD Review Queue

**QB-03**

Cards/table showing:

- Question
- Teacher
- Subject
- Class
- Submitted date
- Age in queue

Actions:

**Open Review**

---

## 16.2 Review Screen

Displays:

- Complete question
- Options
- Correct answer
- Metadata
- Teacher
- Revision history
- Previous comments

Actions:

- Approve
- Request changes/reject
- Comment

### Validation

Reject/request-changes requires a reason.

Approve may optionally permit an HOD note.

---

# 17. QUESTION VERSIONING

Once a question reaches approval:

Any substantive edit creates a **new revision**.

Example:

```text
Question 102

Revision 1 → Rejected
Revision 2 → Approved
Revision 3 → Pending
```

An exam references the precise approved revision used.

That is critical for historical integrity.

---

# 18. QUESTION IMPORT

## 18.1 Teacher Import

**QB-04**

Upload CSV/Excel.

Template fields:

- Question
- Option A
- Option B
- Option C
- Option D
- Correct answer
- Subject
- Class
- Topic
- Difficulty
- Marks

### Import pipeline

```text
Upload
→ Parse
→ Validate
→ Preview
→ Confirm
→ Create Draft Questions
```

Imported questions should initially be:

**DRAFT**

not automatically approved.

---

# 19. EXAM MODULE

This is the second major domain after Question Bank.

---

# 19.1 Exam List

**EX-01**

Tabs:

```text
Draft
Ready
Open
Closed
Completed
Archived
Cancelled
```

Filters:

- Session
- Term
- Subject
- Class
- Teacher
- Department

---

# 19.2 Create Exam

**EX-02**

Step 1:

### Details

- Title
- Subject
- Class
- Department
- Session
- Term
- Exam type

Examples:

- CA
- Test
- Mid-Term
- Examination
- Mock

---

# 20. Exam Question Selection

**EX-03**

Teacher selects from:

> **Approved question revisions only.**

Views:

- Question
- Topic
- Difficulty
- Marks
- Used/not used

Actions:

- Add
- Remove
- Reorder

---

# 21. Question Pool / Random Selection

Production scope should support both:

### Fixed exam

Teacher explicitly selects questions.

### Question pool

Teacher configures:

```text
Topic: Algebra
Difficulty: Mixed
Pool size: 30
Questions shown: 10
```

The system selects from the pool.

This gives us a strong future-facing exam engine without requiring separate exams for every student.

---

# 22. Exam Configuration

**EX-04**

Fields:

- Duration
- Number of attempts
- Question navigation
- Random question order
- Random option order
- Result publication policy
- Instructions
- Accessibility accommodations where applicable

---

# 23. Exam Validation Before READY

The platform must prevent a malformed examination from becoming ready.

Requirements:

- At least one question
- All questions approved
- All questions belong to valid scope
- Marks valid
- Duration greater than zero
- Class has eligible students
- Exam details complete

Potential warning:

> "This exam contains 10 questions but your selected class has no active students."

It may still be saved as draft but cannot become Ready.

---

# 24. Exam States

```text
DRAFT
→ READY
→ OPEN
→ CLOSED
→ COMPLETED
→ ARCHIVED
```

Cancellation:

```text
DRAFT → CANCELLED
READY → CANCELLED
OPEN → CANCELLED
```

but cancellation after student participation requires special handling.

---

# 25. EXAM ACTIVATION

This is the key design we've now locked down.

## 25.1 Ready Exam

Teacher sees:

```text
Status: READY

[OPEN FOR STUDENTS]
```

---

## 25.2 Open Exam

When clicked:

```text
Status: OPEN
```

Eligible students now see it.

There is **no global exam timer**.

---

# 26. ACCESS CONTROL

Student eligibility must evaluate:

- Correct school
- Active account
- Correct session
- Correct class
- Correct subject eligibility
- Exam open
- No completed attempt
- No disqualifying state
- Explicit makeup authorization where applicable

Only then does the assessment appear.

---

# 27. OPEN/CLOSE SEMANTICS

### OPEN

Eligible students may start.

### CLOSE NEW ATTEMPTS

No additional students may start.

Existing attempts continue.

### REOPEN

Authorized administrator/teacher may allow new starts again.

This is essential for batch CBT.

---

# 28. EXAM CONTROL CENTER

**EX-05**

This is a core production screen.

### Summary

```text
Registered: 40
Not Started: 20
In Progress: 15
Submitted: 5
Absent: 0
```

### Live table

- Student
- Attempt status
- Start time
- Time remaining
- Submission
- Administrative flag

### Actions

- Open/close for new attempts
- Allow selected students
- Grant makeup
- Monitor live attempts
- End exam
- View attendance
- Handle exceptions

---

# 29. BATCH CONTROL

Teacher can explicitly authorize students.

Example:

```text
Batch 1
20 students
Allowed

Batch 2
20 students
Not yet allowed
```

The UI shouldn't require the teacher to understand any underlying technical concept.

It simply asks:

> "Who should be allowed to start?"

---

# 30. INDIVIDUAL STUDENT ACCESS

A teacher can:

**Allow Student**

or:

**Revoke Access Before Start**

Once an attempt starts, revoke becomes a stronger action:

**Invalidate Attempt**

and requires confirmation + reason.

---

# 31. INDIVIDUAL ATTEMPT

## 31.1 Start

Student sees preview.

Clicks:

**Start Exam**

System creates:

```text
Attempt
Started At
Duration
```

Timer begins.

---

# 32. EXAM INTERFACE

Requirements:

- Question number
- Question content
- Options
- Timer
- Navigation
- Answer state
- School branding
- Instructions access
- Submit control

### Optional exam-specific navigation policy

Teacher may choose:

**Free navigation**

or

**Sequential navigation**

---

# 33. TIMER

Timer is tied to the attempt, not the examination.

Example:

Student starts at 09:14.

Duration = 60 minutes.

Expected expiration = 10:14.

Another student starting at 09:27 expires at 10:27.

---

# 34. TIME EXPIRY

At expiry:

1. Attempt becomes non-editable.
2. Current persisted answers are finalized.
3. Attempt is auto-submitted.
4. Marking occurs.
5. Student sees submission confirmation.

No "Are you sure?" interaction is needed when time has elapsed.

---

# 35. ANSWER PERSISTENCE

Product requirement:

> Answer progress must survive temporary connectivity interruptions.

The system should preserve answers continuously.

The user should see connection state when relevant.

---

# 36. DISCONNECTION

Student loses connection while writing.

Expected behaviour:

```text
CONNECTION LOST

Your current answers are being preserved.
Please reconnect.
```

Student cannot obtain free time by disconnecting.

The attempt timer follows the defined attempt policy.

---

# 37. SUBMISSION

Manual submission:

```text
Submit Exam
      ↓
Confirmation
      ↓
Finalize
```

Confirmation:

> "You have answered 37 of 40 questions. Are you sure you want to submit?"

This warning is particularly useful for unanswered questions.

---

# 38. ATTEMPT STATES

```text
NOT_STARTED
IN_PROGRESS
SUBMITTED
AUTO_SUBMITTED
INVALIDATED
CANCELLED
```

---

# 39. ABSENCE

Participation state:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
ABSENT
```

A student who never starts by the point the exam is concluded becomes:

**ABSENT**

not:

**0%**

---

# 40. MAKEUP ACCESS

## EX-06

Teacher/Admin selects absent student.

System displays:

```text
Original:
Absent

[Grant Makeup Access]
```

Once granted:

```text
Makeup Authorized
```

Student sees the exam.

A makeup attempt is linked to the same examination.

---

# 41. MAKEUP RULES

The makeup policy should be configurable.

Possible:

- Same question set
- New randomized presentation
- Fresh randomized attempt
- Same duration
- Different duration if approved accommodation

Default:

> Same assessment + same rules + new individual attempt.

---

# 42. EXAM CLOSURE

Teacher selects:

**Close for New Attempts**

then eventually:

**End Examination**

Before ending, system shows:

```text
In Progress: 0
Not Started: 3
Submitted: 37
```

Then asks:

> "These 3 students have not participated. Mark them absent?"

Teacher confirms.

---

# 43. RESULT ENGINE

## 43.1 Automatic marking

For objective questions:

```text
Answer
→ Compare against approved correct answer
→ Calculate marks
→ Calculate total
→ Calculate percentage
```

---

# 44. RESULT STRUCTURE

Result should contain at least:

- Student
- Exam
- Attempt
- Total possible marks
- Earned marks
- Percentage
- Correct count
- Incorrect count
- Unanswered count
- Submission status
- Submission time
- Publication state

---

# 45. RESULT STATES

```text
PROCESSING
FINAL
PUBLISHED
UNPUBLISHED
ADJUSTED
```

The exact lifecycle should avoid ambiguity.

My recommended model:

```text
PROCESSING
→ FINAL
→ PUBLISHED

FINAL → UNPUBLISHED
```

and administrative corrections become:

**ADJUSTED**

with audit information.

---

# 46. GRADING

This needs to be a school-level configurable rule.

Possible configuration:

```text
90–100 → A
80–89  → B
70–79  → C
60–69  → D
50–59  → E
0–49   → F
```

But the platform should not hard-code that as the universal Nigerian grading system.

School Admin should define grading policies where necessary.

The raw:

**marks + percentage**

must always remain available.

That ensures reporting remains mathematically stable even if grading rules change.

---

# 47. RESULT PUBLICATION

Three possible policies:

### Teacher publishes

Teacher controls publication.

### School Admin publishes

Higher-level release.

### Automatic

System publishes immediately after finalization.

School Admin configures the default.

---

# 48. TEACHER RESULTS

**RES-01**

Teacher sees assigned results only.

Functions:

- Search
- Filter
- Sort
- View individual
- View class statistics
- Export CSV
- Publish

---

# 49. HOD RESULTS

HOD sees department scope.

Can compare:

- Subjects
- Classes
- Exams
- Teachers
- Question performance

---

# 50. SCHOOL ADMIN RESULTS

School-wide scope:

- All exams
- Departments
- Classes
- Subjects
- Student performance
- Participation
- Average scores

---

# 51. STUDENT RESULTS

Only published results.

Student cannot see:

- unpublished results
- other students
- teacher comments
- private analytics

unless school policy explicitly allows something.

---

# 52. QUESTION PERFORMANCE

For each exam:

```text
Question
Attempts
Correct %
Incorrect %
Unanswered %
```

This lets teachers/HODs detect:

- overly difficult questions
- ambiguous questions
- misconceptions
- possible poor question design

---

# 53. RESULT CORRECTION

We should avoid a generic:

> "Edit score"

button.

Instead:

**Result Adjustment**

The admin chooses:

- Reason
- Affected attempt/question
- Adjustment type

Examples:

> Void Question 17.

> Award 1 mark to all eligible attempts.

> Recalculate result.

Everything is audited.

---

# 54. RESULT EXPORT

CSV at minimum.

Teacher:

- Own exams

HOD:

- Department

School Admin:

- Entire school

Software Admin:

- Platform/school scope according to permission.

Exports should preserve statuses such as:

```text
ABSENT
NOT ATTEMPTED
COMPLETED
AUTO-SUBMITTED
```

rather than converting everything into zeros.

---

# 55. ANALYTICS MODULE

## 55.1 Teacher analytics

- Average
- Highest
- Lowest
- Pass rate
- Completion
- Question performance
- Class comparison

---

## 55.2 HOD analytics

- Subject comparison
- Class comparison
- Teacher/exam comparison
- Question difficulty
- Department trend

---

## 55.3 School analytics

- Participation
- Performance
- Department comparison
- Session trends
- Assessment volume

---

## 55.4 Software Admin analytics

Business/platform analytics:

- Schools
- Usage
- Activation
- Exam volume
- Students
- Subscription state

Not academic detail unless required.

---

# 56. AUDIT MODULE

Every high-risk action should create an immutable audit event.

Examples:

```text
QUESTION_APPROVED
QUESTION_REJECTED
EXAM_OPENED
EXAM_CLOSED
MAKEUP_GRANTED
ATTEMPT_INVALIDATED
RESULT_PUBLISHED
RESULT_ADJUSTED
USER_DEACTIVATED
CLASS_CHANGED
TEACHER_ASSIGNMENT_CHANGED
```

Audit record should identify:

- Actor
- Role
- School
- Action
- Target
- Timestamp
- Context/reason where applicable

---

# 57. NOTIFICATION MODULE

Not a social notification center.

Notifications are operational.

### Teacher

> 5 questions need revision.

### HOD

> 13 questions awaiting review.

### Moderator

> 7 students are unassigned.

### Student

> Mathematics result published.

### School Admin

> Subscription expires in 30 days.

---

# 58. SETTINGS MODULE

School Admin configuration should include:

### School

- Profile
- Branding

### Academic

- Current session
- Terms

### Assessment

- Default duration rules
- Result publication policy
- Grading scale
- Student result visibility
- Attempt policy

### Operational

- User policies
- Examination settings

---

# 59. STUDENT JOURNEY — COMPLETE SCREEN FLOW

Let's now lock down the student experience exactly.

```text
ST-01 Login
     ↓
ST-02 Student Home
     ↓
Is assessment available?
     │
     ├── NO
     │    ↓
     │  "No assessment available"
     │
     └── YES
          ↓
       ST-03 Assessment Card
          ↓
       ST-04 Instructions / Preview
          ↓
       START
          ↓
       ST-05 Exam Interface
          ↓
       Answer questions
          ↓
       ST-06 Submit confirmation
          ↓
       ST-07 Submitted
          ↓
       Result published?
          │
          ├── NO → Done
          │
          └── YES
               ↓
            ST-08 Result
```

This is the student's entire product journey.

---

# 60. SCHOOL ADMIN JOURNEY

```text
Login
 ↓
Dashboard
 ↓
Configure school
 ↓
Manage academic structure
 ↓
Manage staff
 ↓
Monitor students
 ↓
Monitor assessments
 ↓
View results
 ↓
Reports
 ↓
Session rollover
```

---

# 61. MODERATOR JOURNEY

```text
Login
 ↓
Operational Dashboard
 ↓
Manage users
 ↓
Import students/teachers
 ↓
Assign classes/subjects
 ↓
Maintain academic structure
 ↓
Assist exam operations
 ↓
Reports
```

---

# 62. HOD JOURNEY

```text
Login
 ↓
Department Dashboard
 ↓
Review pending questions
 ↓
Approve / Request Changes
 ↓
Monitor departmental exams
 ↓
View results
 ↓
Analyse department performance
```

---

# 63. TEACHER JOURNEY

```text
Login
 ↓
Teacher Dashboard
 ↓
Create/import questions
 ↓
Submit questions
 ↓
Receive HOD feedback
 ↓
Build exam from approved questions
 ↓
Set READY
 ↓
Open exam
 ↓
Control batches
 ↓
Monitor attempts
 ↓
Close exam
 ↓
Review results
 ↓
Publish
 ↓
Analyse performance
```

---

# 64. SOFTWARE ADMIN JOURNEY

```text
Login
 ↓
Platform Dashboard
 ↓
Create/Manage Schools
 ↓
Manage subscription
 ↓
Monitor usage
 ↓
Investigate platform activity
 ↓
Audit/security
```

---

# 65. Edge Case Matrix

Now the important part: what happens when normal operations don't go perfectly?

| Situation                                     | Expected behaviour                                                   |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Student never starts                          | Mark Absent after exam closes                                        |
| Student starts then loses connection          | Preserve attempt; permit safe resume according to timer policy       |
| Student runs out of time                      | Auto-submit                                                          |
| Student submits early                         | Attempt finalizes                                                    |
| Student tries to reopen submitted exam        | Denied unless authorized exceptional reattempt                       |
| Teacher closes exam with students inside      | New starts stop; active attempts continue                            |
| Teacher wants second batch                    | Open/allow selected students                                         |
| Student absent                                | No score generated                                                   |
| Absent student later takes makeup             | New attempt under same exam; original absence preserved              |
| Teacher leaves school                         | Ownership/history preserved; operational responsibilities reassigned |
| HOD leaves                                    | Approval history preserved; pending queue reassigned                 |
| Student changes class                         | Historical records remain unchanged                                  |
| Student leaves school                         | Account deactivated; history preserved                               |
| Question rejected                             | Teacher revises and resubmits                                        |
| Approved question edited                      | New revision created                                                 |
| Exam question discovered invalid              | Controlled result correction; original question/version preserved    |
| Exam cancelled before use                     | Mark Cancelled                                                       |
| Exam cancelled after attempts                 | Preserve attempts; initiate controlled resolution                    |
| Subscription expires                          | Restrict access; preserve all data                                   |
| Wrong student activated                       | Revoke before start or invalidate after start with reason            |
| Duplicate student import                      | Reject/flag duplicate                                                |
| Duplicate teacher import                      | Reject/flag duplicate                                                |
| No HOD available                              | School Admin may designate a new HOD/review authority                |
| Exam has no eligible students                 | Cannot become Ready                                                  |
| Current session ends with active exams        | Session cannot be closed until resolved                              |
| Student account disabled while attempt active | Attempt remains preserved; administrative policy governs completion  |
| Result publication needs reversal             | Unpublish with audit record                                          |
| Result needs correction                       | Formal result-adjustment workflow                                    |
| Computer/power failure                        | Attempt state survives; resume according to policy                   |
| Network outage for entire lab                 | Exam remains preserved; administration can pause/close new attempts  |

---

# 66. Important Policy Decisions We Should Make Configurable

Not every school should be forced into one policy.

The platform should therefore distinguish between:

### Core platform rules

These cannot be overridden.

Examples:

- School isolation
- Audit trail
- Historical preservation
- Approved-question requirement
- No silent result modification
- Role scope

and:

### School-configurable policies

Examples:

- Result publication
- Grading scale
- Student result visibility
- Question navigation
- Makeup rules
- Accommodation rules
- Attempt count
- Default assessment behaviour

This gives the product flexibility without creating chaos.

---

# 67. What Should NOT Be Configurable

We should avoid making the product infinitely customizable.

The following should remain fixed at platform level:

> A question used in a completed exam cannot simply be rewritten.

> An attempt cannot gain additional time through disconnect/reconnect.

> A student cannot see another student's result.

> A teacher cannot access classes they are not assigned.

> An absent student should not silently become a zero-score attempt.

> School data cannot leak across tenants.

These are product integrity rules.

---

# 68. Production-Grade Quality Requirements at Product Level

Although we're not discussing technology yet, the product itself needs explicit quality requirements.

### Reliability

An exam must tolerate routine network instability.

### Consistency

A student's result must always be derived from the recorded attempt.

### Auditability

Sensitive actions must have traceability.

### Recoverability

Interrupted sessions must be recoverable.

### Integrity

Exam content and historical results must not be silently altered.

### Usability

Teachers should be able to operate an exam in a busy physical computer lab without technical expertise.

### Performance expectation

A school may have hundreds or thousands of students and many simultaneous attempts, so the product model must not assume tiny schools.

---

# 69. The Core Domains Are Now Fully Defined

We have effectively locked these product domains:

```text
01. Platform Administration
02. Subscription Management
03. School Onboarding
04. School Branding
05. Academic Structure
06. User Management
07. Teacher/Class/Subject Assignment
08. Question Bank
09. Question Review & Governance
10. Question Import
11. Exam Builder
12. Exam Configuration
13. Exam Activation
14. Exam Control Center
15. Student CBT
16. Attempt Management
17. Attendance / Absence
18. Makeup Examination
19. Automatic Marking
20. Result Management
21. Result Publication
22. Analytics
23. Reporting / Export
24. Audit Trail
25. Notifications
26. Academic Session Rollover
27. Historical Records
28. School Subscription Lifecycle
```

That is considerably more comprehensive than a conventional "CBT app."

---

# 70. One Important Addition: Exam Administration Sessions

I would formally add one concept to the product model before we move to architecture.

We already established that one exam can serve batches.

For proper operational reporting, we should track:

**Exam**

and underneath it:

**Administration Sessions**

Example:

```text
Mathematics First Term Examination
│
├── Administration Session 1
│   └── 20 students
│
├── Administration Session 2
│   └── 17 students
│
└── Makeup Session
    └── 3 students
```

This is **not a new exam**.

It is simply a record of how the exam was administered.

That gives the school useful information:

> "This examination was administered in three sessions."

It also gives us a natural place to record:

- Invigilator
- Session start
- Session end
- Lab/room
- Students authorized
- Session notes

This is valuable in real physical CBT environments.

---

# 71. Another Important Addition: Examination Instructions as a First-Class Object

The teacher should be able to set:

### General instructions

> Answer all questions.

### Navigation instructions

> You may move freely between questions.

### Submission instructions

> Check your answers before submitting.

These should be shown before the exam and optionally accessible during the exam.

We should keep instructions distinct from the first question so they are not accidentally treated as assessment content.

---

# 72. Another Important Addition: Exam Readiness Check

Before an exam becomes **READY**, the system should run an automatic checklist.

Example:

```text
EXAM READINESS

✓ School active
✓ Session active
✓ Class active
✓ Subject active
✓ 40 questions selected
✓ All questions approved
✓ Duration configured
✓ Instructions configured
✓ Eligible students found
✓ Result policy configured

READY
```

If something fails:

```text
✗ 3 questions are awaiting approval

[Resolve]
```

This dramatically reduces administrative mistakes.

---

# 73. Another Important Addition: Operational Exam Alerts

The Control Center should surface warnings such as:

> 5 students have not started.

> 2 students are disconnected.

> 1 student has experienced repeated exam-window exits.

> 3 students have less than 5 minutes remaining.

These are **operational signals**, not accusations.

---

# 74. Product Definition Now Reaches a Good Boundary

At this point, we've gone through:

**Vision → Roles → Permission matrix → School lifecycle → Module map → Screen hierarchy → Functional requirements → State machines → Edge cases → Policy boundaries.**

That is the point where moving to architecture becomes meaningful.

The next phase should therefore **not** be "pick NestJS/Postgres/Next.js/etc."

The next phase should be a **domain and data-model design**:

```text
School
Academic Session
Term
Department
Class
Subject
User
Student
Teacher
HOD
Moderator
Assignment
Question
Question Revision
Question Review
Exam
Exam Question
Exam Session
Exam Attempt
Answer
Result
Result Adjustment
Publication
Audit Event
Subscription
```

We should map the relationships between these entities, define ownership, identify which data is immutable, define state transitions, and determine the transaction boundaries around an examination.

Once that is done, **then** the technical architecture becomes a translation of an already-solid product rather than the place where product decisions accidentally get made.
