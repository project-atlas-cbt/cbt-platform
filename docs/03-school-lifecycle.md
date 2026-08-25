# CBT Platform — Complete End-to-End School Lifecycle

This will serve as the **canonical operational model for the product**. The permission matrix we just defined sits underneath every stage.

The core principle is:

> **A school enters the platform once, configures its academic structure, manages people and permissions, builds a governed question bank, creates assessments from approved questions, activates them when physically ready, administers individual student attempts, produces immutable results, and carries the school forward from one academic session to the next without destroying historical records.**

---

# 1. The Complete Lifecycle at a Glance

```text
SOFTWARE ADMIN
      │
      ▼
Create School
      │
      ▼
Issue / Activate Subscription
      │
      ▼
School Onboarding
      │
      ├── School Profile
      ├── Branding
      ├── Academic Session
      ├── Departments
      ├── Classes
      └── Subjects
      │
      ▼
School Admin
      │
      ├── Create Moderators
      ├── Create HODs
      ├── Create Teachers
      └── Configure assignments
             │
             ▼
        User Provisioning
             │
             ├── Teachers → Subjects + Classes
             └── Students → Classes + Department
             │
             ▼
       Teacher Question Bank
             │
             ▼
       Submit for HOD Review
             │
        ┌────┴────┐
        ▼         ▼
    Approved   Rejected
        │         │
        │         └──► Teacher revises
        │
        ▼
     Create Exam
        │
        ▼
     Configure
        │
        ▼
     Ready
        │
        ▼
   Teacher / Invigilator
   Opens Exam
        │
        ▼
 Students receive assessment
        │
        ▼
 Student starts
        │
        ▼
 Individual timer begins
        │
        ▼
 Answer questions
        │
        ├────► Submit
        │
        └────► Time expires
                    │
                    ▼
                Auto-submit
                    │
                    ▼
              Automatic marking
                    │
                    ▼
                  Results
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
       Student   Teacher     HOD
          │         │         │
          ▼         ▼         ▼
       Published  Analytics  Department
       Result     & Reports   Analytics
                    │
                    ▼
            Absent / Makeup
                    │
                    ▼
           Historical records
                    │
                    ▼
           End of Academic Session
                    │
                    ▼
             Student Promotion
                    │
                    ▼
              New Session
```

Now let's lock down each stage.

---

# 2. Stage 0 — School Exists at Platform Level

This happens outside the school's ordinary workflow.

### Actor

**Software Admin**

### Software Admin creates:

- School name
- School identifier
- Contact information
- Primary school administrator
- Subscription plan
- Subscription start date
- Subscription expiry date
- School status

The school receives its activation mechanism.

### School lifecycle status

A school should have explicit states:

```text
PROVISIONAL
   ↓
ACTIVE
   ↓
SUSPENDED
   ↓
EXPIRED
   ↓
REACTIVATED
```

Potentially:

```text
DEACTIVATED
```

for a permanently terminated account.

### Important rule

**Suspension/expiration must never mean deletion of academic data.**

Questions, exams, results, users, and historical records remain preserved.

---

# 3. Stage 1 — First School Activation

The School Admin receives the activation key/invitation.

They enter the key.

The platform validates:

- Key authenticity
- School association
- Subscription validity
- Expiration
- Whether it has already been used

Once valid:

```text
School Status: ACTIVE
Subscription: ACTIVE
```

The School Admin is directed to the onboarding wizard.

---

# 4. Stage 2 — School Onboarding Wizard

The first login is deliberately different from every subsequent login.

The school configures its identity and academic foundation.

## Step 1 — School Profile

Required:

- School name
- Short name/abbreviation
- Contact details
- Address
- Principal/administrative contact where appropriate

Optional:

- Motto
- Website
- Phone
- Email

---

# 5. Step 2 — Branding

The school provides:

### Logo

Upload school logo.

### Primary colour

The school chooses one colour.

For example:

```text
Primary: #0057B8
```

The platform handles the rest.

The system generates:

- Primary
- Darker shade
- Lighter shade
- Hover/active states
- Background variants
- Text contrast where necessary

We do **not** ask the school to design its own theme.

The philosophy is:

> **One primary school colour + white + automatically derived UI shades.**

Before saving:

**Preview School Theme**

The admin sees how it looks on:

- Login
- Dashboard
- Exam interface
- Buttons
- Tables
- Result pages

Then confirms.

### Branding rule

Once established, School Admin can change branding only through the permitted configuration flow.

Every school should feel visually independent without requiring a custom frontend.

---

# 6. Step 3 — Academic Session

The school creates/activates the current session.

Example:

**2026/2027**

The platform asks for:

- Session name
- Start date
- End date

Then terms:

- First Term
- Second Term
- Third Term

The school can configure term names if needed.

### Current session

Only one academic session should be marked:

> **CURRENT**

at a time.

Previous sessions remain historical.

---

# 7. Step 4 — Departments

Default suggestions:

- Science
- Business
- Humanities

But these are **not hard-coded restrictions**.

School can:

- Add department
- Rename department
- Deactivate department
- Create another department

Example:

```text
Science
Business
Humanities
Technical
Vocational
```

### Important rule

A department should not be casually deleted if it has historical academic records.

Instead:

> **Deactivate department**

Historical examinations and results remain associated with it.

---

# 8. Step 5 — Classes

The school creates the actual student groups.

For example:

```text
JSS1A
JSS1B

SS1 Science A
SS1 Science B

SS1 Business A
SS1 Humanities A

SS2 Science A
...
```

A class has attributes such as:

- Name
- Level
- Arm
- Department
- Academic session
- Active/inactive status

### Why session matters

`SS2A` in 2026/2027 isn't the same academic entity as `SS2A` in 2027/2028.

This gives us clean historical reporting.

---

# 9. Step 6 — Subjects

School creates or imports subjects.

Examples:

```text
Mathematics
English Language
Biology
Chemistry
Physics
Economics
Government
Literature
Accounting
```

Each subject may be associated with:

- Department
- Class/level
- Session

A subject can also be used across several classes.

---

# 10. Stage 3 — Staff Setup

At this point the school has:

```text
School
Session
Terms
Departments
Classes
Subjects
```

Now it creates the people who operate the system.

---

# 11. School Admin Creates Moderators

School Admin:

**Users → Moderators → Add**

Moderator receives:

- Name
- Login identity
- Temporary credential/invitation
- Status

Moderator can now manage the school's day-to-day data.

School Admin remains above them.

---

# 12. Moderator Creates HODs

HOD record includes:

- Name
- Login
- Department
- Assigned subjects where applicable
- Status

Example:

```text
Mrs. Johnson
Role: HOD
Department: Science
```

HOD immediately inherits department-scoped authority.

---

# 13. Moderator Creates Teachers

Teacher profile:

```text
Teacher
─────────────
Name
Staff ID
Department
Subjects
Classes
Account status
```

But simply creating a teacher isn't enough.

They must be assigned what they teach.

---

# 14. Teacher Assignment

A teacher can have multiple assignments.

Example:

```text
Mr. Ade

Mathematics
 ├── SS1A
 ├── SS1B
 └── SS2A
```

This assignment determines:

- Which questions they can create
- Which questions they can edit
- Which exams they can create
- Which students' results they can view
- Which classes they can administer
- Which exports they can generate

This becomes one of the core authorization boundaries of the entire platform.

---

# 15. Stage 4 — Student Provisioning

Students can be added:

### Individually

or preferably:

### Bulk import

CSV/Excel.

Example:

```text
Student ID | Name | Class | Department
---------------------------------------
ST001       Ahmed Bello   SS1A   Science
ST002       David James   SS1A   Science
ST003       Mary John     SS1B   Business
```

The system validates the file before committing.

---

# 16. Import Validation

The platform shouldn't blindly import bad records.

It should detect:

- Missing student ID
- Duplicate student ID
- Invalid class
- Invalid department
- Missing name
- Existing account
- Invalid formatting

Example:

```text
1,487 records detected

Valid:
1,472

Needs attention:
15
```

The moderator fixes those before finalization.

---

# 17. Student Account Lifecycle

Students can be:

```text
INVITED
ACTIVE
SUSPENDED
INACTIVE
GRADUATED
ARCHIVED
```

A student isn't deleted simply because they leave the school.

Historical exam attempts/results must survive.

---

# 18. Stage 5 — The School Is Now Operational

At this point:

```text
School
 ├── Configuration
 ├── Departments
 ├── Classes
 ├── Subjects
 ├── Moderators
 ├── HODs
 ├── Teachers
 └── Students
```

Now academic assessment begins.

---

# 19. Stage 6 — Teacher Builds Question Bank

Teacher goes to:

**Question Bank → My Subjects**

They only see subjects/classes assigned to them.

They create questions as:

### Draft

The teacher can freely:

- Create
- Edit
- Delete

---

# 20. Question Structure

Every question should contain:

### Academic metadata

- Subject
- Class/level
- Department
- Topic
- Subtopic where applicable
- Difficulty
- Marks

### Content

- Question
- Image/media
- Options
- Correct answer
- Optional explanation

### Governance metadata

- Created by
- Created date
- Updated date
- Status
- Review history
- Version/revision information

---

# 21. Question Lifecycle

Canonical state machine:

```text
DRAFT
  ↓
SUBMITTED
  ↓
UNDER REVIEW
  ├───────────────┐
  ▼               ▼
APPROVED        REJECTED
                  │
                  ▼
                DRAFT
```

An approved question can later become:

```text
ARCHIVED
```

but shouldn't simply disappear.

---

# 22. HOD Review

HOD sees pending questions for their department.

For each submission:

```text
Question
Options
Correct Answer
Teacher
Class
Subject
Topic
```

HOD actions:

**Approve**

or

**Reject / Request Changes**

with mandatory feedback when rejected.

Example:

> "Option B and C are both correct. Please revise."

Teacher receives it.

---

# 23. Question Revision

Teacher edits the rejected question.

The previous review history isn't erased.

We retain:

```text
Revision 1 → Rejected
Revision 2 → Approved
```

This gives academic accountability.

---

# 24. Approved Question Integrity

Once a question is approved:

- Teacher cannot silently alter it.
- If it needs modification, a new revision is created.
- If already used in an exam, the exact version used by that exam is preserved.

This is essential.

Imagine a school challenges a result six months later.

We must be able to answer:

> **Exactly what question did this student receive?**

---

# 25. Stage 7 — Exam Creation

Teacher selects:

**Create Examination**

They define:

### Identity

- Exam title
- Subject
- Class
- Department
- Academic session
- Term
- Examination type

Examples:

```text
First CA
Second CA
Mid-Term Test
First Term Examination
Mock Examination
```

---

# 26. Exam Configuration

Teacher configures:

- Questions
- Duration
- Number of questions
- Marks
- Random question order
- Random option order
- Attempt policy
- Navigation policy
- Whether students can revisit questions
- Result visibility
- Instructions

Potentially later:

- Section structure
- Different question weights
- Special accommodations

---

# 27. Exam Rule: Only Approved Questions

Teacher can only add:

> **Approved questions**

to an exam.

The platform should not permit bypassing this rule simply because the teacher wants to use a draft.

This preserves the HOD governance model.

---

# 28. Exam Status Lifecycle

I'd formally use:

```text
DRAFT
  ↓
READY
  ↓
OPEN
  ↓
CLOSED
  ↓
COMPLETED
  ↓
ARCHIVED
```

Where:

### DRAFT

Still being built.

### READY

Configuration complete and ready to administer.

### OPEN

Students may be granted/receive access.

### CLOSED

No new students can begin unless explicitly reopened/authorized.

### COMPLETED

Administration is finished and results finalized.

### ARCHIVED

Historical record.

---

# 29. Stage 8 — Exam Activation

This is our newly agreed core model.

There is **no mandatory global start/end time**.

Teacher/invigilator opens the exam when the lab is ready.

Example:

```text
Mathematics First Term Examination

Status: READY

[OPEN FOR STUDENTS]
```

They press:

**Open for Students**

Now eligible students can see it.

---

# 30. Student Visibility

The student portal doesn't show the school's entire examination calendar.

It shows:

> **Assessment currently available to you.**

Example:

```text
AVAILABLE NOW

Mathematics
First Term Examination

50 Questions
60 Minutes

[START]
```

If nothing is open:

```text
No assessment is currently available.
```

This preserves the focused CBT experience.

---

# 31. Eligibility

When an exam opens, the system checks:

```text
Student active?
        +
Correct school?
        +
Correct session?
        +
Correct class?
        +
Eligible for subject?
        +
Not already completed?
        +
Not currently disallowed?
```

Only eligible students are shown the exam.

---

# 32. Stage 9 — Student Starts Exam

Student presses:

**START EXAM**

The system creates an individual attempt.

Example:

```text
Student: Ahmed
Exam: Mathematics
Started: 09:07
Duration: 60 minutes
```

**The 60-minute timer starts now.**

Not when the teacher opened the exam.

Not when the first student started.

Not at a fixed wall-clock time.

---

# 33. Individual Attempt Lifecycle

```text
NOT STARTED
      ↓
IN PROGRESS
      │
      ├──────────► SUBMITTED
      │
      └──────────► TIME EXPIRED
                         ↓
                    AUTO-SUBMITTED
```

Potential administrative outcomes:

```text
INVALIDATED
CANCELLED
```

where justified and audited.

---

# 34. Exam Experience

During the exam the student sees:

- School branding
- Exam title
- Question number
- Question
- Options
- Timer
- Navigation
- Answer state

The experience stays focused.

No social feed.

No unnecessary dashboard navigation.

No unrelated notifications.

---

# 35. Answer Persistence

This is a **product requirement**, not merely a technical implementation detail.

Every answer should be preserved as the student works.

A brief network interruption must not cause:

> "You lost all your answers."

The system must be designed around **resilient attempts**.

---

# 36. Student Disconnects

Suppose:

**Ahmed is 25 minutes into a 60-minute exam.**

His internet disappears.

The platform should preserve his attempt.

When he reconnects:

> **Resume Exam**

His remaining time is governed by the attempt timer rather than being reset.

The exact behavior of timer continuity during prolonged disconnection will later be formalized technically, but the business rule is:

> **A student cannot gain additional exam time simply by disconnecting.**

---

# 37. Stage 10 — Exam Control Center

The teacher/invigilator gets the most important operational screen.

### Example

```text
MATHEMATICS
First Term Examination

Status: OPEN

Registered       40
Not Started      20
In Progress      15
Submitted         5
Absent            0
```

Live student table:

```text
Student          Status          Time Left
-------------------------------------------
Ahmed            In Progress     43:18
David            In Progress     38:04
Mary             Submitted       —
John             Not Started     —
```

This is the teacher's **live invigilation interface**.

---

# 38. Batch Administration

Teacher doesn't have to launch another exam for Batch 2.

They simply control access.

Example:

### Batch 1

20 students:

```text
Allowed
```

Then after completion:

### Batch 2

Select remaining 20:

```text
[Allow Selected Students]
```

Now those students can start the same exam.

This preserves a single assessment identity.

---

# 39. Important: Don't Create Fake "Batch Exams"

We should not create:

```text
Math Exam Batch 1
Math Exam Batch 2
Math Exam Makeup
```

as three separate examinations.

Instead:

```text
Mathematics First Term Examination
        │
        ├── Attempt: Student 1
        ├── Attempt: Student 2
        ├── ...
        └── Attempt: Student 40
```

Optionally, administration sessions can be recorded behind the scenes.

This makes reporting much cleaner.

---

# 40. Closing New Attempts

Teacher can select:

**Close for New Attempts**

This means:

> New students cannot begin.

But existing students continue until they:

- Submit
- Time out
- Are administratively terminated

This is safer than abruptly destroying everyone currently taking the exam.

---

# 41. Ending an Exam

When administration is genuinely finished:

**End Examination**

System checks:

```text
In Progress: 0
Not Started: X
Submitted: Y
```

Teacher confirms.

Students who never participated become:

> **Absent**

unless an authorized administrative decision says otherwise.

---

# 42. Absence

Absence is recorded separately from an attempt.

Example:

```text
Student: Ahmed
Exam: Mathematics
Participation: ABSENT
Attempt: NONE
```

This is important because:

> **No attempt ≠ zero score.**

An absent student should not automatically receive 0%.

Their report should say:

**Absent**

unless school policy explicitly defines another outcome.

---

# 43. Makeup Examination

A teacher can later select an absent student:

```text
Ahmed Bello
Status: Absent
```

and choose:

**Grant Makeup Access**

The student then receives access to the existing examination.

They create a new attempt.

Historical data becomes:

```text
Original session:
Absent

Makeup attempt:
Completed
Score: 78%
```

The original absence is never erased.

---

# 44. Makeup Attempts Need Explicit Metadata

A makeup attempt should record:

- Original exam
- Student
- Reason/category
- Authorized by
- Authorization date
- Attempt start
- Submission
- Score

Example:

```text
Attempt Type:
MAKEUP

Authorized by:
Mr. Ade

Reason:
Medical absence
```

Whether schools actually collect a reason can be configurable.

---

# 45. Attempt Policy

Every exam should specify:

### Default

**One attempt per student.**

A completed attempt normally cannot be restarted.

However, privileged users can authorize:

> **Exceptional Reattempt**

which should be extremely visible in the audit trail.

This prevents accidental duplicate attempts.

---

# 46. Automatic Marking

Once an objective exam is submitted:

```text
Attempt
   ↓
Answer evaluation
   ↓
Score calculation
   ↓
Percentage
   ↓
Result
```

Example:

```text
Correct: 43
Incorrect: 7
Marks: 43/50
Percentage: 86%
```

No teacher needs to manually calculate objective scores.

---

# 47. Result Finalization

A completed attempt should have:

```text
PROVISIONAL
```

briefly, while the system processes it.

Then:

```text
FINAL
```

Once finalized.

After finalization, score-changing actions are highly restricted.

---

# 48. Result Integrity

The system must preserve:

- Original answers
- Question version
- Correct answers at time of exam
- Marks
- Final score
- Submission time
- Attempt status

A result should never simply become:

> `Score = 86`

with no underlying evidence.

We need the complete audit trail.

---

# 49. Result Publication

The exam can have a school-controlled result policy:

### Option A

**Immediately available to student**

### Option B

**Teacher publishes**

### Option C

**School releases results**

This should be configurable.

Until publication, the student sees nothing beyond whatever the school chooses to expose.

---

# 50. Student Results

When results are published:

```text
Mathematics
First Term Examination

Score: 43 / 50
Percentage: 86%
```

Potential breakdown:

```text
Correct: 43
Incorrect: 7
Unanswered: 0
```

Whether correct answers or question-by-question review are exposed should be configurable.

---

# 51. Teacher Result View

Teacher can see:

```text
SS2A Mathematics

Students: 40
Completed: 37
Absent: 3

Average: 68.7%
Highest: 94%
Lowest: 31%
```

And individual results.

Teacher can export CSV.

---

# 52. HOD Result View

HOD sees department-scoped performance.

For example:

```text
Science Department

Mathematics     72.4%
Physics         65.8%
Chemistry       69.1%
Biology         76.3%
```

They can drill down into classes and exams under their department.

---

# 53. School Admin Result View

School Admin gets school-wide performance.

Potential dashboard:

```text
Total Students          1,240
Active Teachers            87
Exams Conducted           142
Exam Attempts          38,201

Average Performance       69.2%
```

But again, access should respect academic/privacy considerations.

---

# 54. Question Analytics

After sufficient exam data exists, teachers/HODs can see:

```text
Question    Correct Rate
------------------------
Q1             94%
Q2             81%
Q3             37%
Q4             89%
Q5             22%
```

This is one of the most useful educational features because it answers:

> "Which concepts are students struggling with?"

It turns the CBT system into an assessment intelligence platform without becoming an LMS.

---

# 55. Exam Completion

Once:

- All intended students are processed
- Active attempts are finished
- Administration is over

the teacher closes the exam.

Status:

**COMPLETED**

The examination is then locked against arbitrary structural changes.

---

# 56. Exam Archive

Eventually:

**ARCHIVED**

Archived exams remain searchable by authorized users.

They should not be editable like active records.

School can still access:

- Exam details
- Questions used
- Student attempts
- Results
- Analytics
- Audit history

---

# 57. Stage 11 — Audit Trail

Every high-impact action should be recorded.

Examples:

```text
Who:
Mr. Ade

Action:
Approved exam for activation

When:
24 Aug 2026, 10:04

Object:
Mathematics First Term Examination
```

Other important audit events:

- User created
- User deactivated
- Teacher assignment changed
- Question approved
- Question rejected
- Exam activated
- Exam closed
- Student granted makeup access
- Attempt invalidated
- Result published
- Result adjusted
- School suspended
- Subscription changed

The audit system becomes especially important when schools start trusting this platform for high-stakes examinations.

---

# 58. Stage 12 — Student Lifecycle During the Year

Students will not remain static.

We need explicit operations for:

### New student

Create/import → Assign class → Activate account.

### Student changes class

```text
SS1A → SS1B
```

Historical attempts remain associated with the original class at the time of the exam.

### Student changes department

Historical records remain unchanged.

### Student leaves

Account becomes inactive.

Data remains.

### Student graduates

Account becomes:

**GRADUATED**

not deleted.

---

# 59. Historical Academic Context Must Be Immutable

This principle deserves emphasis.

Suppose Ahmed was in:

**SS2A / Science / 2026-2027**

and took Mathematics.

Later he moves to:

**SS2B / Science**

We should not retroactively make his old examination say:

> SS2B.

The exam occurred while he was in SS2A.

Therefore, historical records must preserve the context **at the time of the event**.

---

# 60. Stage 13 — End of Academic Session

At the end of the session, School Admin/Moderator begins:

# Session Close

The system should show:

```text
Academic Session: 2026/2027

Active Students: 1,240
Graduating Students: 312
Students Eligible for Promotion: 928

Incomplete Exams: 0
Pending Results: 0
```

The system should warn about unresolved issues before allowing finalization.

---

# 61. Promotion Workflow

Never make promotion an instant mass update.

Use:

### Step 1 — Generate promotion candidates

Example:

```text
JSS1 → JSS2
JSS2 → JSS3
SS1 → SS2
SS2 → SS3
SS3 → Graduated
```

### Step 2 — Review

School can manually change exceptions.

### Step 3 — Confirm

Promotion becomes effective.

---

# 62. Promotion Exceptions

A student may:

- Repeat class
- Change department
- Transfer
- Graduate
- Withdraw
- Move to another arm

Example:

```text
Student: Ahmed
Automatic suggestion: SS2A → SS3A

Admin decision:
SS2A → SS2B
Reason: Repeat Year
```

The system records the administrative decision.

---

# 63. New Academic Session

Once promotion is confirmed:

```text
2026/2027
     ↓
ARCHIVED

2027/2028
     ↓
CURRENT
```

The new session gets its own:

- Classes
- Student assignments
- Subject mappings
- Teacher assignments
- Examinations
- Results

Historical data remains linked to the old session.

---

# 64. Teachers Across Sessions

Teachers should not automatically retain every assignment forever.

At the new session:

> Review teacher assignments.

Example:

```text
Mr Ade

Previous:
Mathematics
SS1A
SS1B
SS2A

New session:
Mathematics
SS2A
SS2B
SS3A
```

School confirms.

---

# 65. HODs Across Sessions

Same principle.

A HOD assignment may continue, but the system should allow:

- Reassignment
- Department changes
- Replacement

The system should never assume organizational structure is permanently static.

---

# 66. Stage 14 — Subscription Expiry

This needs to be carefully defined.

Suppose the school subscription expires.

The school shouldn't lose:

- Questions
- Exams
- Results
- Users
- History

Instead, depending on our commercial policy:

### Before expiry

Notifications/warnings.

### Expired

Platform access becomes restricted.

Potential model:

```text
School status:
EXPIRED

Students:
No exam access

Teachers:
No new exams

Administrators:
Can view renewal information

Data:
Preserved
```

Upon renewal:

```text
ACTIVE
```

operations resume.

The exact grace period can be a commercial decision later.

---

# 67. What Happens During an Active Exam if Subscription Expires?

This is an important edge case.

We should establish now:

> **An already-started legitimate attempt should not suddenly disappear because a subscription status changed.**

The platform should preserve and finalize the attempt safely.

In practice, we can later define precise infrastructure behavior, but the product principle is:

**Never corrupt an active examination because of billing state.**

---

# 68. Teacher Leaves During the Term

Another important case.

Teacher account:

**DEACTIVATED**

Their existing:

- Questions
- Exams
- Results

remain intact.

But their active operational responsibilities can be reassigned.

Example:

```text
Mr Ade leaves

Questions:
Remain attributed to Mr Ade

Exam:
Mathematics First Term Exam

Administration:
Reassigned to Mrs Bola
```

We should never rewrite authorship.

---

# 69. HOD Leaves

Same principle.

Old approvals remain attributed to the old HOD.

School Admin assigns a new HOD.

Pending review items can be reassigned.

---

# 70. Student Leaves Mid-Term

Same principle.

Their previous attempts/results remain.

Their account becomes inactive.

If they transfer out, the school may optionally retain a complete academic history.

---

# 71. Exam Is Cancelled Before Students Start

Teacher/Admin can:

**Cancel Exam**

Status:

```text
CANCELLED
```

No attempts exist.

The examination remains historically recorded as cancelled.

Reason should be captured.

---

# 72. Exam Is Cancelled After Students Have Started

Much more sensitive.

Do **not** simply delete it.

Instead:

```text
Exam Status:
CANCELLED

Existing attempts:
PRESERVED

Reason:
Network failure
```

Then authorized school personnel can decide whether:

- Attempts are invalidated
- Results are retained
- A replacement exam is created

Any decision must be auditable.

---

# 73. Question Is Discovered to Be Wrong After Exam

This is a realistic high-stakes case.

Suppose question 17 is discovered to be invalid.

We shouldn't modify the original question and pretend it wasn't wrong.

Instead, authorized result handling can apply a documented resolution such as:

- Void question
- Award mark to all eligible students
- Exclude question from score
- Recalculate affected attempts

The exact correction policy can be configurable.

But the important principle is:

> **Post-exam corrections are controlled result adjustments, not silent question edits.**

---

# 74. Student Doesn't Submit

Timer reaches zero.

System:

**Auto-submits the attempt.**

Status:

```text
AUTO_SUBMITTED
```

The answers already stored are marked.

Student receives the resulting score according to school publication policy.

---

# 75. Student Tries to Take the Same Exam Again

If the student's attempt is:

**SUBMITTED**

the exam is no longer available to them.

If special permission is granted:

> New attempt must be explicitly authorized.

The original attempt remains untouched.

---

# 76. Student Is Accidentally Activated

Teacher accidentally allows the wrong student.

There should be:

**Revoke Access**

before the student starts.

If the student has already started, it becomes:

**Invalidate Attempt**

and requires a reason.

This prevents people from casually deleting evidence.

---

# 77. Exam Accessibility / Special Accommodations

This is something I'd include in the production foundation.

Some students may require legitimate accommodations.

The exam framework should eventually allow school-authorized settings such as:

- Extended time
- Larger display
- Additional accessibility settings

We should not assume every student must have the identical UI/timing if school policy requires accommodations.

The exam itself remains the same assessment.

---

# 78. Exam Integrity / Anti-Cheating Foundation

Without turning the platform into an advanced proctoring system, the core product should support:

- Question randomization
- Option randomization
- Controlled attempts
- Attempt timing
- Fullscreen mode where supported
- Tab/window-change monitoring where supported
- Warning events
- Administrative visibility
- Audit trail

But these are **controls**, not evidence of cheating by themselves.

For example:

> "Student left exam window 4 times"

should be recorded as an event, not automatically labeled:

> "Student cheated."

That distinction matters.

---

# 79. Reporting Hierarchy

The reporting system should mirror the organizational structure.

### Student

Own results.

### Teacher

Assigned classes and subjects.

### HOD

Department.

### Moderator

School operations.

### School Admin

Entire school.

### Software Admin

All schools/platform.

This symmetry makes authorization much easier to reason about.

---

# 80. What Exists After 5 Years?

This is a useful test of our model.

A school should eventually have:

```text
School
│
├── 2026/2027
│   ├── Exams
│   ├── Attempts
│   ├── Results
│   └── Users/context
│
├── 2027/2028
│   ├── Exams
│   ├── Attempts
│   ├── Results
│   └── Users/context
│
└── 2028/2029
    ├── Exams
    ├── Attempts
    ├── Results
    └── Users/context
```

A school administrator should be able to search:

> "Show Ahmed Bello's Mathematics result from First Term 2026/2027."

And retrieve it without ambiguity.

That is what makes this a real school examination system rather than a collection of quizzes.

---

# 81. Canonical State Models

We now have several important state machines.

### School

```text
PROVISIONAL
→ ACTIVE
→ SUSPENDED / EXPIRED
→ REACTIVATED
```

### User

```text
INVITED
→ ACTIVE
→ SUSPENDED
→ INACTIVE
→ GRADUATED / ARCHIVED
```

### Question

```text
DRAFT
→ SUBMITTED
→ UNDER REVIEW
→ APPROVED
→ ARCHIVED

or

UNDER REVIEW
→ REJECTED
→ DRAFT
```

### Exam

```text
DRAFT
→ READY
→ OPEN
→ CLOSED
→ COMPLETED
→ ARCHIVED
```

with cancellation possible at appropriate stages.

### Attempt

```text
NOT STARTED
→ IN PROGRESS
→ SUBMITTED
```

or:

```text
IN PROGRESS
→ TIME EXPIRED
→ AUTO-SUBMITTED
```

with administrative states:

```text
INVALIDATED
CANCELLED
```

### Participation

```text
NOT YET STARTED
IN PROGRESS
COMPLETED
ABSENT
```

This distinction between **attempt state** and **participation state** is important.

---

# 82. The Most Important Product Rules

I would now consider these non-negotiable rules of the platform.

### Rule 1

**An exam has no mandatory global start/end clock.**

Availability is controlled by authorized school staff.

### Rule 2

**Every student has an independent exam timer.**

### Rule 3

**One examination can serve multiple physical CBT batches.**

### Rule 4

**A student cannot see an examination merely because it exists.**

They must be eligible and explicitly allowed to access it.

### Rule 5

**Absent is not zero.**

An absent student has no attempt unless they later take a makeup attempt.

### Rule 6

**Makeup attempts never erase original attendance history.**

### Rule 7

**Approved questions are controlled academic assets.**

They cannot be silently modified.

### Rule 8

**Completed attempts are immutable by default.**

Corrections require explicit administrative actions and audit trails.

### Rule 9

**Historical academic context never changes retroactively.**

### Rule 10

**School subscription status never causes academic data deletion.**

### Rule 11

**Every sensitive administrative action is auditable.**

### Rule 12

**Student UX is intentionally minimal.**

This is an assessment portal, not an LMS/social platform.

---

# 83. The Full School Lifecycle in One Concrete Example

Let's run an actual school through the entire system.

### School: Greenfield College

Software Admin:

> Creates Greenfield College.

Subscription:

> 2026/2027 annual.

School Admin activates the school.

### Setup

```text
Departments:
Science
Business
Humanities

Classes:
SS2A
SS2B
SS2C
```

Subjects created.

Teachers imported.

Students imported.

Mr Ade assigned:

```text
Mathematics
SS2A
SS2B
```

Mrs Bello assigned as:

```text
Science HOD
```

---

### Question creation

Mr Ade creates 100 Mathematics questions.

40 are submitted.

HOD reviews them.

32 approved.

8 rejected.

Mr Ade revises 8.

5 become approved.

Now:

**37 approved questions.**

---

### Exam

Mr Ade creates:

**SS2A Mathematics First Term Examination**

Configuration:

```text
40 questions
60 minutes
Random order
Random options
One attempt
```

Exam uses approved questions.

Status:

**READY**

---

### Examination day

SS2A has:

**40 students**

Computer lab has:

**20 computers**

Mr Ade opens the exam.

First 20 students are allowed.

20 start.

Each receives their individual 60-minute timer.

Some finish after 45 minutes.

Some finish after 60 minutes.

One student's internet disappears temporarily.

They reconnect and resume.

At the end:

```text
20 completed
```

Mr Ade closes new attempts.

Allows the second 20.

They take the same exam.

At the end:

```text
40 registered
40 completed
0 absent
```

---

### Another scenario

Three students don't show up.

At closing:

```text
37 completed
3 absent
```

Results are generated for 37.

Three remain:

**ABSENT**

Next week, the teacher authorizes the three students.

They take makeup attempts.

History becomes:

```text
Original:
Absent

Makeup:
Completed
```

The school still has one examination record.

Not five different exams.

---

# 84. What This Gives Us

At this point, the product is no longer just:

> "Teachers upload questions and students answer them."

We now have a coherent **School Examination Operating System**:

```text
                 SCHOOL
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
      MANAGEMENT          ACADEMICS
          │                   │
          │             QUESTION BANK
          │                   │
          │              HOD GOVERNANCE
          │                   │
          │               EXAM BUILDER
          │                   │
          └──────────┬────────┘
                     ▼
              EXAM CONTROL
                     │
              ┌──────┴──────┐
              ▼             ▼
           BATCH 1       BATCH 2
              │             │
              └──────┬──────┘
                     ▼
              INDIVIDUAL ATTEMPTS
                     │
                     ▼
                AUTO MARKING
                     │
             ┌───────┼────────┐
             ▼       ▼        ▼
          RESULTS  ANALYTICS  HISTORY
                     │
                     ▼
             SESSION ROLLOVER
```

---

# 85. This is now our product foundation

I would consider the following **locked for the next design phase**:

**Roles:**
Software Admin, School Admin, Moderator, HOD, Teacher, Student.

**Academic hierarchy:**
School → Session → Term → Department → Class → Subject → Student/Teacher assignments.

**Assessment hierarchy:**
Question Bank → Approved Questions → Exam → Activation → Individual Attempts → Results.

**Exam model:**
No rigid global start/end time. Authorized staff open/close access, while every student's timer starts individually.

**Batch model:**
One exam can serve unlimited physical batches.

**Absence model:**
Absence is a participation status, not a score and not an attempt.

**Makeup model:**
Makeup creates a new attempt against the same exam while preserving original absence.

**Governance model:**
Teacher creates → HOD reviews → Approved question becomes usable → Teacher builds exam.

**Result model:**
Automatic marking → finalization → publication → analytics → historical preservation.

**Academic year model:**
Sessions are preserved historically, with controlled student promotion into the next session.

**Security model:**
Scoped permissions + immutable academic history + audit trail.

**Branding model:**
One school primary colour + white + generated shades + school logo.

**Subscription model:**
Platform-controlled annual access without deleting school data on expiration.

---

The natural next product-design artifact is now **the actual module map and screen hierarchy**: what the Software Admin sees, what the School Admin dashboard contains, what the Teacher workspace contains, what the HOD review workspace looks like, what the Moderator manages, and exactly what screens the student encounters before/during/after an exam. That will turn this lifecycle into a concrete product structure before we discuss architecture.
