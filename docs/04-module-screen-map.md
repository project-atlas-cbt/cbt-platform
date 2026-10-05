# CBT Platform — Module Map & Screen Hierarchy

This is the next layer of the product specification. It translates the lifecycle and permission model into a concrete application structure without making any technical decisions yet.

The guiding rule is:

> **Each role should see a workspace designed around its actual job, not a generic dashboard with every feature exposed.**

The platform therefore has two major environments:

```text
PLATFORM ENVIRONMENT
└── Software Admin

SCHOOL ENVIRONMENT
├── School Admin
├── Moderator
├── HOD
├── Teacher
└── Student
```

---

# 1. Overall Application Structure

At a high level:

```text
CBT PLATFORM
│
├── Platform Administration
│   └── Software Admin
│
└── School Workspace
    │
    ├── School Admin
    │
    ├── Moderator
    │
    ├── HOD
    │
    ├── Teacher
    │
    └── Student
```

The school workspace shares the same underlying school identity, branding, academic data, and authentication system, but each role gets a different navigation and experience.

---

# 2. Global Login & Entry Experience

Before role-specific screens, there is a common entry layer.

## Login

```text
┌─────────────────────────────────┐
│           SCHOOL LOGO           │
│                                 │
│      Welcome to Greenfield      │
│          CBT Portal             │
│                                 │
│ Username / Student ID           │
│ Password                        │
│                                 │
│            [Login]              │
│                                 │
│ Forgot password?                │
└─────────────────────────────────┘
```

The school logo and primary colour are used here.

For Software Admin, the platform has a distinct platform-branded login rather than pretending to be a particular school.

---

# 3. First-Time School Activation

This is not the normal dashboard.

When the School Admin first activates a new school, they enter the **School Setup Wizard**.

```text
School Activation
   │
   ├── 1. Verify School
   ├── 2. School Profile
   ├── 3. Branding
   ├── 4. Academic Session
   ├── 5. Departments
   ├── 6. Classes
   ├── 7. Subjects
   ├── 8. Staff
   ├── 9. Students
   └── 10. Review & Finish
```

The wizard should be resumable.

A school should not lose onboarding progress because the administrator closes the browser.

---

# 4. Shared School Navigation

After onboarding, the school environment has a consistent shell.

Conceptually:

```text
┌─────────────────────────────────────────────────────┐
│ LOGO   Greenfield College                  Profile │
├───────────────┬─────────────────────────────────────┤
│               │                                     │
│ Navigation    │          Main Workspace             │
│               │                                     │
│ Dashboard     │                                     │
│ People        │                                     │
│ Academics     │                                     │
│ Questions     │                                     │
│ Exams         │                                     │
│ Results       │                                     │
│ Reports       │                                     │
│ Settings      │                                     │
│               │                                     │
└───────────────┴─────────────────────────────────────┘
```

But the actual navigation items change by role.

---

# 5. Software Admin Workspace

The Software Admin operates at platform level.

## Primary Navigation

```text
Dashboard
Schools
Subscriptions
Platform Analytics
Audit & Security
System Configuration
```

Potentially:

```text
Support
```

later.

---

# 6. Software Admin Dashboard

This is a platform operations dashboard.

### Top-level metrics

```text
Total Schools
Active Schools
Expired Schools
Students
Teachers
Exams Conducted
Exam Attempts
```

Example:

```text
┌──────────────────────────────────────────────┐
│ Platform Overview                            │
│                                              │
│ 128 Schools      97 Active      9 Expired    │
│                                              │
│ 184,320 Students     8,421 Teachers          │
│                                              │
│ 31,492 Exams       4.8M Attempts             │
└──────────────────────────────────────────────┘
```

---

# 7. Software Admin → Schools

This is the primary platform-management area.

### School list

```text
Schools

Search...
Filter: Active | Expired | Suspended

School              Status       Students
-------------------------------------------
Greenfield College  Active       1,240
Kings Academy       Active         820
...
```

Actions:

- View
- Activate
- Suspend
- Renew
- View subscription
- View metrics

---

# 8. Software Admin → School Detail

Opening a school should give a **platform-level overview**, not duplicate the entire school application.

```text
Greenfield College

Overview
Subscription
Usage
Users
Exams
Activity
Audit
```

### Overview

- School information
- Current status
- Subscription
- Number of users
- Last activity

### Subscription

- Plan
- Start
- Expiry
- Activation history
- Renewal history

### Usage

- Students
- Teachers
- Questions
- Exams
- Attempts
- Storage/resource usage where relevant

---

# 9. Software Admin → Platform Analytics

This should answer:

> How is the entire product being used?

Examples:

- Active schools by month
- Exams conducted
- Student attempts
- School growth
- Usage by region
- Active vs inactive schools

This is more about **business/platform intelligence** than academic analytics.

---

# 10. Software Admin → Audit & Security

Platform-level actions:

```text
Actor
Action
School
Object
Timestamp
Result
```

Examples:

```text
Software Admin
Suspended School
Greenfield College
24 Aug 2026
```

or:

```text
School Admin
Published Exam
Greenfield College
Mathematics First Term Exam
```

The Software Admin can investigate system-wide events where permitted.

---

# 11. School Admin Workspace

School Admin is the highest authority inside a school.

## Primary Navigation

```text
Dashboard
People
Academics
Questions
Exams
Results
Reports
School Settings
```

I would also give the School Admin a highly visible:

**Subscription**

indicator, but not necessarily a whole navigation section.

---

# 12. School Admin Dashboard

This should be a **school operations dashboard**.

### Overview

```text
Students       1,240
Teachers          87
HODs              12
Moderators         3
Classes           31
Subjects          42
```

### Assessment overview

```text
Exams this term     47
Active now           2
Completed           41
Draft                4
```

### Performance overview

```text
Average Performance
68.7%

Students Assessed
1,183

Completion Rate
95.4%
```

### Operational alerts

Examples:

> 3 teachers have pending question submissions.

> 2 classes have no Mathematics teacher assigned.

> Subscription expires in 43 days.

This makes the dashboard genuinely useful.

---

# 13. School Admin → People

Rather than immediately dumping every user into one table, provide:

```text
People
│
├── Moderators
├── HODs
├── Teachers
└── Students
```

Each area has its own management workflow.

---

# 14. School Admin → Academics

```text
Academics
│
├── Academic Sessions
├── Terms
├── Departments
├── Classes
└── Subjects
```

This becomes the school's academic structure management center.

---

# 15. School Admin → Questions

School Admin doesn't need to act as the primary question creator.

Instead, this section is about **oversight**:

```text
Question Bank
Pending Reviews
Approved
Rejected
Archived
Question Analytics
```

School Admin can inspect the question system but academic approval remains with HODs.

---

# 16. School Admin → Exams

```text
Exams
│
├── All Exams
├── Active Exams
├── Draft Exams
├── Completed
└── Archived
```

Opening an exam provides:

- Exam information
- Questions summary
- Class
- Teacher
- Status
- Attempts
- Results
- Audit activity

---

# 17. School Admin → Results

This is school-wide reporting.

```text
Results
│
├── By Exam
├── By Class
├── By Subject
├── By Department
├── Student Performance
└── Result Publication
```

---

# 18. School Admin → Reports

This becomes more export-oriented.

Examples:

- Student list
- Teacher list
- Class list
- Exam results
- Performance reports
- Attendance/participation reports
- Question performance
- Session reports

---

# 19. School Admin → School Settings

```text
Settings
│
├── School Profile
├── Branding
├── Assessment Rules
├── Result Visibility
├── Academic Configuration
├── User Policies
└── Subscription
```

Some settings can be changed by School Admin; others may be platform-controlled.

---

# 20. Moderator Workspace

The Moderator is much more operational.

## Primary Navigation

```text
Dashboard
People
Academics
Exam Operations
Reports
```

I would **not** expose the full question governance interface prominently.

The moderator's job is administration, not academic approval.

---

# 21. Moderator Dashboard

Focus on actionable administrative information:

```text
Students: 1,240
Teachers: 87
HODs: 12

Pending Student Imports: 1
Unassigned Students: 8
Unassigned Teachers: 2
Inactive Accounts: 14
```

And:

> "SS2B currently has no Mathematics teacher assigned."

That is much more useful than generic statistics.

---

# 22. Moderator → People

```text
People
│
├── Students
│   ├── All Students
│   ├── Import Students
│   ├── Class Assignment
│   └── Student Status
│
├── Teachers
│   ├── All Teachers
│   ├── Import Teachers
│   └── Assignments
│
└── HODs
```

This is essentially the **school's operational directory**.

---

# 23. Moderator → Student Management

Student list:

```text
Search students...

Student ID
Name
Class
Department
Status
```

Actions:

- Add
- Edit
- Deactivate
- Reset credentials
- Move class
- View profile
- Export
- Import

---

# 24. Moderator → Class Assignment

A particularly useful screen:

```text
Class Assignment

SS2A

Students: 40

Ahmed Bello
David John
Mary James
...
```

The Moderator can select students and move them between classes according to permission.

---

# 25. Moderator → Teacher Assignments

This could be a dedicated assignment interface:

```text
Teacher Assignment

Teacher:
Mr Ade

Subjects
☑ Mathematics

Classes
☑ SS1A
☑ SS1B
☑ SS2A
```

This is much better than making the moderator edit a teacher profile and hunt through unrelated settings.

---

# 26. Moderator → Academics

Moderator can manage:

- Departments
- Classes
- Subjects
- Sessions
- Terms

This ensures the school structure stays usable.

---

# 27. Moderator → Exam Operations

This is where the Moderator can assist teachers.

```text
Exam Operations
│
├── Active Exams
├── Scheduled/Ready Exams
├── Exam Control
├── Makeup Access
└── Exam History
```

The moderator should be able to assist with physical CBT administration, especially when there are multiple labs or sessions.

---

# 28. HOD Workspace

The HOD's application should feel substantially different from the Moderator's.

The HOD is an **academic governance workspace**.

## Primary Navigation

```text
Dashboard
Question Review
Question Bank
Exams
Results
Department Analytics
Reports
```

---

# 29. HOD Dashboard

Top-level departmental picture:

```text
Science Department

Teachers                18
Students               412
Classes                  9
Subjects                 6

Pending Questions       27
Active Exams             1
Completed Exams          18

Department Average    71.2%
```

Then:

### Pending review queue

```text
27 Questions Awaiting Review

Mathematics — 11
Physics      — 7
Chemistry    — 5
Biology      — 4

[Review Questions]
```

This should be the most prominent action.

---

# 30. HOD → Question Review

This needs a dedicated workflow.

```text
Question Review

Pending
Approved
Rejected
```

Clicking a question opens a review workspace:

```text
Mathematics
SS2
Quadratic Equations

Question:
...

A. ...
B. ...
C. ...
D. ...

Correct Answer: C

Created by: Mr Ade
Submitted: 24 Aug 2026

[Approve]
[Request Changes]
```

Commenting is integrated into the review.

---

# 31. HOD → Question History

The HOD should be able to see:

```text
Revision 1
Submitted
Rejected
"Option B is ambiguous"

Revision 2
Submitted
Approved
```

This gives proper academic accountability.

---

# 32. HOD → Question Bank

Once approved, HOD can browse:

- Subject
- Class
- Topic
- Difficulty
- Status

This is primarily an **oversight interface**.

---

# 33. HOD → Exams

The HOD can oversee exams within their department.

```text
Department Exams

Active
Ready
Completed
Archived
```

Opening an exam shows:

- Creator
- Class
- Subject
- Questions
- Status
- Attempts
- Results

---

# 34. HOD → Department Analytics

This is one of the strongest HOD pages.

```text
Science Department

Subject           Average
-------------------------
Mathematics        72.4%
Physics            65.8%
Chemistry          69.1%
Biology            76.3%
```

Then:

```text
Class Performance

SS1A  74%
SS1B  69%
SS2A  73%
SS2B  62%
```

And:

**Question Performance**

to identify difficult topics.

---

# 35. Teacher Workspace

This is probably the most feature-rich school workspace.

## Primary Navigation

```text
Dashboard
My Classes
Question Bank
Exams
Exam Control
Results
Reports
```

The teacher does not need:

- School settings
- User management
- Subscription management
- Department management

Those are distractions.

---

# 36. Teacher Dashboard

The teacher should immediately see:

```text
Good morning, Mr Ade

My Subjects
Mathematics

My Classes
SS1A
SS1B
SS2A
```

### Quick actions

```text
[Create Question]
[Create Exam]
[Open Exam]
[View Results]
```

### Activity

```text
Questions awaiting review: 8
Approved questions: 142

Active exams: 1
Completed exams: 12
```

---

# 37. Teacher → My Classes

```text
My Classes

SS1A
40 Students
12 Exams

SS1B
38 Students
10 Exams

SS2A
40 Students
15 Exams
```

Clicking a class provides:

- Students
- Exams
- Performance
- Subjects taught

---

# 38. Teacher → Question Bank

This should be a major workspace.

```text
Question Bank

My Questions

[Create Question]
[Import Questions]

Filters:
Subject
Class
Topic
Difficulty
Status
```

Tabs:

```text
Draft
Submitted
Approved
Rejected
Archived
```

When the Draft tab is active, a teacher may bulk-submit drafts for review in
one action (`POST /v1/questions/bulk-submit`, user instruction 2026-09 — the
frozen spec below omits it; the import path already validates questions, so
per-question submission is unnecessary overhead). The bank list carries an
explicit `mine` flag per row; only the caller's own drafts are selectable
(disabled checkbox + "written by a colleague" affordance for everyone
else's). Best-effort semantics: each selected draft is submitted through the
ordinary single-submit engine and independently audited, and the response
reports per-question outcomes (`submitted` / `failed` with a code) rather
than failing the batch wholesale. HOD review remains fully manual (B9 — a
reviewer's approval decision is a single high-integrity academic judgment and
is never bulk-operated).

---

# 39. Teacher → Question Editor

The editor should support:

### Content

```text
Question
[Rich content editor]

Image
[Upload]

Question Type
Multiple Choice

A. ______
B. ______
C. ______
D. ______

Correct Answer
[C]

Marks
1
```

### Academic metadata

```text
Subject: Mathematics
Class: SS2A
Topic: Quadratic Equations
Difficulty: Medium
```

### Actions

```text
Save Draft
Submit for Review
```

---

# 40. Teacher → Rejected Questions

This deserves its own useful workflow.

```text
Rejected Questions

Question 17
Reason:
"Two correct options."

[Edit & Resubmit]
```

This avoids forcing teachers to hunt through hundreds of questions.

---

# 41. Teacher → Exams

```text
Exams
│
├── Draft
├── Ready
├── Active
├── Completed
└── Archived
```

This is much cleaner than mixing everything together.

---

# 42. Teacher → Exam Builder

The exam builder should feel like a guided process.

```text
Create Exam

1. Details
2. Questions
3. Rules
4. Review
5. Ready
```

### Details

```text
Exam title
Subject
Class
Department
Term
Exam type
```

### Questions

```text
Approved Question Bank

☑ Q1
☑ Q2
☑ Q7
☑ Q10
...
```

or future functionality:

**Generate from question pool.**

---

# 43. Teacher → Exam Rules

```text
Duration: 60 minutes

Attempts: 1

Randomize Questions: ON
Randomize Options: ON

Allow Navigation: YES

Result Visibility:
After Teacher Publishes
```

And potentially:

```text
Special Accommodation:
Supported
```

---

# 44. Teacher → Exam Review

Before opening:

```text
Mathematics
First Term Examination

40 Questions
60 Minutes
SS2A

Questions: 40
Approved: 40
Marks: 40

Randomization: ON
Attempts: 1

[Edit]
[Save as Ready]
```

This is the final safety checkpoint.

---

# 45. Teacher → Exam Control Center

This becomes the teacher's **live operational screen**.

```text
MATHEMATICS
First Term Examination

OPEN

Registered: 40
Not Started: 12
In Progress: 20
Submitted: 8
Absent: 0
```

Actions:

```text
[Close New Attempts]
[Allow Students]
[View Live Attempts]
[End Examination]
```

---

# 46. Live Attempt Table

```text
Student        Status          Time Left
----------------------------------------
Ahmed          In Progress     42:18
David          Submitted        —
Mary           In Progress     31:06
John           Not Started      —
```

Teacher can identify the next batch immediately.

---

# 47. Teacher → Makeup Access

This should be directly accessible from the exam control center after administration.

```text
Students

Ahmed       Completed
David       Completed
Mary        Absent
John        Completed

[Grant Makeup Access]
```

After selection:

```text
Mary James

Original Status:
ABSENT

Grant:
MAKEUP ACCESS

[Confirm]
```

---

# 48. Teacher → Results

```text
Results

My Exams
│
├── First CA
├── Mid-Term
├── First Term Examination
└── ...
```

Opening one:

```text
Mathematics
First Term Examination

40 Students
37 Completed
3 Absent

Average: 68.7%
Highest: 94%
Lowest: 31%
```

---

# 49. Teacher → Result Detail

```text
Student       Score     %
-------------------------
Ahmed         43/50     86%
David         39/50     78%
Mary          ABSENT    —
John          47/50     94%
```

Actions:

**Export CSV**

**Publish Results**

**View Analytics**

---

# 50. Teacher → Question Analytics

For an exam:

```text
Question Performance

Q1    94% correct
Q2    81%
Q3    37%
Q4    89%
Q5    22%
```

Click Q3:

```text
Topic:
Quadratic Equations

Correct: 37%
Incorrect: 63%
```

This is highly valuable for teachers.

---

# 51. Teacher → Reports

Primarily:

- Exam results
- Class performance
- Student performance
- Question performance
- CSV export
- Printable reports

---

# 52. Student Workspace

This is where I would deliberately resist the temptation to build a "dashboard-heavy" application.

The student experience should be **extremely simple**.

## Student Navigation

```text
Assessment
Results
Profile
```

That's basically it.

Potentially there doesn't even need to be a traditional sidebar on the exam interface.

---

# 53. Student Home

```text
┌────────────────────────────────────┐
│ LOGO                    Ahmed ▼    │
├────────────────────────────────────┤
│                                    │
│         AVAILABLE NOW              │
│                                    │
│  MATHEMATICS                       │
│  First Term Examination            │
│                                    │
│  40 Questions                      │
│  60 Minutes                        │
│                                    │
│          [START EXAM]              │
│                                    │
└────────────────────────────────────┘
```

If nothing is active:

```text
No assessment is currently available.
```

That's intentional.

---

# 54. Student → Assessment Preview

Before the student enters the exam:

```text
Mathematics
First Term Examination

Questions: 40
Duration: 60 minutes
Attempts: 1

Instructions:

• Answer all questions.
• Your timer begins when you start.
• Your exam will submit automatically when time expires.
• Do not leave the examination interface.

[START EXAM]
```

This is the final confirmation.

---

# 55. Student → Exam Interface

This screen should be radically focused.

```text
┌─────────────────────────────────────────────┐
│ MATHEMATICS                      42:31       │
├───────────────┬─────────────────────────────┤
│               │                             │
│  1  2  3  4   │ Question 17 of 40           │
│  5  6  7  8   │                             │
│  9 10 11 12   │ What is the value of x?     │
│ 13 14 15 16   │                             │
│ 17 18 19 20   │ ○ 2                         │
│ ...           │ ○ 4                         │
│               │ ○ 6                         │
│               │ ○ 8                         │
│               │                             │
│               │ [Previous]      [Next]      │
└───────────────┴─────────────────────────────┘
```

The interface should be optimized for computer-lab environments.

---

# 56. Student Question Navigator

States:

```text
Unanswered
Answered
Current
```

Student can move between questions depending on exam rules.

Questions are numbered clearly.

This is preferable to forcing students through a single linear sequence in every examination.

---

# 57. Student → Exam Warning States

The product should have explicit system states for:

### Connection interrupted

> Connection lost. Your answers are being preserved. Reconnecting…

### Time warning

> 5 minutes remaining.

### Final minute

> 60 seconds remaining.

### Submission confirmation

> Are you sure you want to submit?

---

# 58. Student → Auto Submission

When time expires:

```text
Time has expired.

Your assessment has been submitted automatically.

[View Submission Status]
```

No ambiguity.

---

# 59. Student → Submission Confirmation

After manual submission:

```text
Assessment Submitted

Mathematics
First Term Examination

Submitted:
10:04 AM

Your result will be available according to your school's result policy.

[Return]
```

The student cannot accidentally restart the exam.

---

# 60. Student → Results

Results screen:

```text
My Results

Mathematics
First Term Examination
86%

English
First CA
78%

Physics
Mid-Term
91%
```

Only published results appear here.

---

# 61. Student → Result Detail

```text
Mathematics
First Term Examination

86%

43 / 50

Correct: 43
Incorrect: 7
Unanswered: 0
```

Depending on school policy, question review may appear.

---

# 62. Student → Profile

Keep it simple:

```text
Ahmed Bello
Student ID: ST001
Class: SS2A
Department: Science

[Change Password]
```

No unnecessary social/profile functionality.

---

# 63. Student's Entire Journey

The student journey should effectively be:

```text
LOGIN
  ↓
Home
  ↓
Assessment Available?
  │
  ├── No → Wait
  │
  └── Yes
       ↓
   Preview
       ↓
    Start
       ↓
    Exam
       ↓
   Submit
       ↓
   Result
       ↓
    Done
```

That's exactly the kind of simplicity we want.

---

# 64. Shared Notification System

I would introduce **system notifications**, but not a social notification center.

Examples:

Teacher:

> 8 questions were rejected by the HOD.

HOD:

> 14 questions are awaiting review.

Moderator:

> 7 students are missing class assignments.

Student:

> Your Mathematics result is now available.

These should be **action-oriented notifications**.

---

# 65. Search

Search should be role-aware.

### School Admin

Can search:

- Students
- Teachers
- HODs
- Classes
- Exams
- Questions

### HOD

Search:

- Questions
- Teachers
- Exams
- Students
- Department results

### Teacher

Search:

- Students in assigned classes
- Questions
- Exams

### Student

Probably no global search at all.

---

# 66. Global School Context Switcher

For administrators, the system should always make the active academic context visible:

```text
Greenfield College
2026/2027
First Term
```

This prevents one of the most dangerous administrative mistakes:

> Working in the wrong academic session.

For example:

```text
[2026/2027 ▼]
```

School Admin and Moderator can switch historical sessions where permitted.

Teacher/HOD default to the current session but can access historical records.

---

# 67. Role-Specific Dashboard Philosophy

This is important enough to formalize.

### Software Admin

**"How is the platform performing?"**

### School Admin

**"How is my school performing and is everything operational?"**

### Moderator

**"Is the school's data and user structure correctly configured?"**

### HOD

**"Is my department academically ready and performing well?"**

### Teacher

**"Can I create, administer, and evaluate my assessments?"**

### Student

**"Do I have an assessment to take, and what are my published results?"**

Every dashboard should answer those questions immediately.

---

# 68. Complete Module Map

Now we can consolidate the entire application.

```text
PLATFORM
│
└── Software Admin
    ├── Dashboard
    ├── Schools
    │   ├── All Schools
    │   ├── School Detail
    │   ├── Subscription
    │   ├── Usage
    │   └── Activity
    ├── Platform Analytics
    ├── Audit & Security
    └── System Configuration


SCHOOL
│
├── School Admin
│   ├── Dashboard
│   ├── People
│   │   ├── Moderators
│   │   ├── HODs
│   │   ├── Teachers
│   │   └── Students
│   ├── Academics
│   │   ├── Sessions
│   │   ├── Terms
│   │   ├── Departments
│   │   ├── Classes
│   │   └── Subjects
│   ├── Questions
│   ├── Exams
│   ├── Results
│   ├── Reports
│   └── Settings
│       ├── School Profile
│       ├── Branding
│       ├── Assessment Rules
│       └── Subscription
│
├── Moderator
│   ├── Dashboard
│   ├── People
│   │   ├── Students
│   │   ├── Teachers
│   │   └── HODs
│   ├── Academics
│   ├── Exam Operations
│   └── Reports
│
├── HOD
│   ├── Dashboard
│   ├── Question Review
│   ├── Question Bank
│   ├── Exams
│   ├── Results
│   ├── Department Analytics
│   └── Reports
│
├── Teacher
│   ├── Dashboard
│   ├── My Classes
│   ├── Question Bank
│   │   ├── Draft
│   │   ├── Submitted
│   │   ├── Approved
│   │   ├── Rejected
│   │   └── Archived
│   ├── Exams
│   │   ├── Draft
│   │   ├── Ready
│   │   ├── Active
│   │   ├── Completed
│   │   └── Archived
│   ├── Exam Control
│   ├── Results
│   └── Reports
│
└── Student
    ├── Assessment
    ├── Exam
    ├── Results
    └── Profile
```

> **Amended by ADR-0035 (2026-10-05):** every staff workspace (School Admin, Moderator, HOD,
> Teacher) ends with a **Help** item: task guides for that role, filtered by permission, with
> search and a support contact. Students and Software Admin have no Help item.

---

# 69. The Most Important Screen in the Entire Product

Although every role matters, I think the **Exam Control Center** should receive disproportionate attention during design.

Because in a real Nigerian CBT environment, the teacher isn't simply uploading an exam.

They are standing in a computer lab with:

**40 students + 20 computers + 60-minute assessment.**

The operational interface needs to make that situation effortless.

It should let them immediately answer:

> Who has access?

> Who started?

> Who is still writing?

> Who submitted?

> Who hasn't started?

> Who is absent?

> Who needs makeup access?

> Can I close new attempts?

> Can I reopen for the next batch?

That is where our product can feel substantially better than generic quiz software.

---

# 70. The Second Most Important Screen: Question Review

The HOD experience should similarly feel designed for schools rather than generic LMS software.

The HOD should be able to sit down and process:

> **27 questions awaiting review**

in a structured queue, with:

**Approve → Reject → Comment → Next**

without opening a maze of unrelated screens.

---

# 71. The Third Most Important Experience: Student CBT

The student experience should be the opposite.

The sophistication should be **behind the scenes**.

The student sees:

```text
Login
  ↓
Assessment Available
  ↓
Start
  ↓
Questions
  ↓
Submit
```

That's it.

The system underneath is doing all the complex work:

- timing
- persistence
- attempt tracking
- eligibility
- randomization
- scoring
- audit
- result processing
- offline/reconnection handling
- historical preservation

---

# 72. Final Product Structure

At this point, our product definition has three solid layers:

### Layer 1 — Governance

```text
Software Admin
School Admin
Moderator
HOD
Teacher
Student
```

### Layer 2 — School Operations

```text
People
Academics
Classes
Subjects
Assignments
Sessions
```

### Layer 3 — Assessment Engine

```text
Question Bank
Question Review
Exam Builder
Exam Activation
Exam Control
Student Attempts
Automatic Marking
Results
Analytics
Historical Records
```

And the product's central loop is now extremely clear:

> **Configure school → Configure people → Build question bank → Approve questions → Build exam → Open exam → Administer individual attempts → Mark automatically → Publish results → Analyze performance → Preserve history → Roll into next session.**

This is a sufficiently detailed product structure to move into the next phase: **defining each module's exact functional requirements, screen-by-screen behavior, user actions, validations, states, and edge cases**. After that, we can safely move to the architecture without discovering fundamental product ambiguities halfway through development.
