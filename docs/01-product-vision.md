Yes. **This is exactly the stage where we should slow down and design the product itself before touching technology.**

The biggest thing I would establish upfront is this:

> **This is a school examination management and Computer-Based Testing platform — not an LMS.**

That distinction should drive almost every product decision. Teachers aren't building courses, students aren't consuming learning materials, and we're not trying to replicate Google Classroom, Moodle, etc. The core loop is:

**School setup → Users/classes/subjects → Question bank → Exam creation → Approval → Exam delivery → Submission → Automatic marking → Results → Reporting.**

I also think we should make the system **multi-school from day one** conceptually. Each school is an isolated tenant with its own users, configuration, exams, questions, results, branding, etc.

---

# 1. First: Let's define the hierarchy

I would structure the platform around this hierarchy:

**Platform**
→ Schools
→ School Administration
→ Academic Structure
→ Users
→ Classes
→ Subjects
→ Question Bank
→ Exams
→ Attempts
→ Results
→ Reports

Within a school:

```text
School
│
├── Departments
│   ├── Science
│   ├── Business
│   ├── Humanities
│   └── All
│
├── Classes
│   ├── JSS 1A
│   ├── JSS 1B
│   ├── SS 1A
│   └── ...
│
├── Subjects
│   ├── Mathematics
│   ├── English
│   ├── Biology
│   └── ...
│
├── Teachers
├── HODs
├── Moderators
├── Admins
├── Students
│
├── Question Bank
├── Exams
├── Exam Attempts
└── Results
```

This gives us a clean foundation.

---

# 2. Roles

I would actually use **6 roles**, rather than the 5 you currently have.

### Platform level

1. **Software Admin**
2. **School Admin**

### School academic/operational level

3. **Moderator**
4. **HOD**
5. **Teacher**
6. **Student**

The distinction between **Software Admin** and **School Admin** is very important.

---

# 3. Software Admin

This is **your company's/platform operator**, not somebody at the school.

They manage the entire CBT platform.

### Software Admin can:

#### School management

- Create school
- View schools
- Activate school
- Suspend school
- Revoke access
- Renew subscription
- View subscription status
- Generate/issue school activation key
- View subscription expiry
- View school information
- Configure school limits if necessary

For example:

```text
School: Kings College
Status: ACTIVE
Subscription: Annual
Expires: 31 Aug 2027
Students: 1,240
Teachers: 87
Exams conducted: 142
```

### Platform metrics

They should be able to see:

- Number of schools
- Active schools
- Expired schools
- Students
- Teachers
- Exams conducted
- Questions created
- Exam attempts
- Platform usage
- Subscription revenue eventually

And potentially:

**School activity**

```text
School                  Students    Exams    Last Activity
------------------------------------------------------------
School A                  1,240       142      Today
School B                    820        87      Yesterday
School C                    430        41      5 days ago
```

This becomes very useful commercially.

---

# 4. School Admin

This is the highest-level administrator **inside a school**.

Your current description:

> General Overseer

I'd rename this to **School Admin** in the product.

The school may internally call the person "Admin", "Principal", "Director", etc., but the system role should remain consistent.

---

## School Admin responsibilities

### School configuration

On first setup:

- School name
- School logo
- Primary colour
- Academic structure
- Departments
- Classes
- Subjects
- grading configuration

The branding should be extremely simple.

They provide:

**Primary colour**

For example:

`#1565C0`

The system automatically generates the rest of the UI theme around it.

We shouldn't ask them to configure 10 colours.

The platform should essentially become:

**School Primary Colour + White + generated shades**

So a school with blue branding gets a blue/white CBT interface.

---

# 5. School Admin → User management

School Admin shouldn't necessarily manage every student manually.

They should be able to:

- Add moderator
- Remove moderator
- View moderators
- Reset moderator credentials
- Change school settings
- View school-wide reports
- Manage branding

Potentially also:

- Manage HODs
- Manage teachers
- Manage students

But I would allow the **Moderator** to handle day-to-day user administration.

That prevents the School Admin dashboard from becoming unnecessarily complicated.

---

# 6. Moderator

This is essentially the school's **operational administrator**.

This person handles the school's data.

### User management

Moderator can:

**Students**

- Create student
- Edit student
- Deactivate student
- Reactivate student
- Reset password
- Assign class
- Move student to another class
- View student profile
- Import students
- Export students

**Teachers**

- Create teacher
- Edit teacher
- Deactivate teacher
- Reset password
- Assign subjects
- Assign classes
- Assign department

**HODs**

- Create HOD
- Edit HOD
- Remove HOD
- Assign department
- Assign subjects

---

# 7. VERY IMPORTANT: Bulk Upload

This is something you didn't mention, but **I consider it essential**.

Imagine a school has:

**1,500 students.**

Nobody should be manually creating 1,500 accounts.

The Moderator should have:

> **Import Students**

Upload CSV/Excel.

Example:

```text
Student ID | First Name | Last Name | Class | Department
---------------------------------------------------------
ST001      | Ahmed      | Bello     | SS1A  | Science
ST002      | David      | John      | SS1A  | Science
ST003      | Mary       | James     | SS1B  | Business
```

The system validates the file before importing.

It should show:

```text
1,487 valid records
13 records require correction

[View Issues] [Import Valid Records]
```

Same concept for teachers.

This will be extremely important in real Nigerian schools.

---

# 8. Student

Student should have **the simplest interface in the entire system**.

The student shouldn't see administrative complexity.

### Student dashboard

Something like:

```text
Good morning, Ahmed

Upcoming Exams
----------------------------

Mathematics
Friday, 9:00 AM
Duration: 60 minutes

English Language
Friday, 11:00 AM
Duration: 45 minutes

[View Exams]
```

Once an exam becomes available:

**Start Exam**

Before starting:

```text
MATHEMATICS

Duration: 60 minutes
Questions: 50
Instructions:

• Answer all questions.
• Do not refresh the page.
• Your exam will automatically submit when time expires.

[Start Exam]
```

---

# 9. Exam experience

This is the heart of the product.

We need to make this **very robust**.

During an exam:

```text
MATHEMATICS

Question 17 of 50

What is the value of x?

2x + 5 = 15

○ 2
○ 5
○ 10
○ 15


[Previous]       [Next]
```

And a question navigator:

```text
1  2  3  4  5
6  7  8  9 10
11 12 13 14 15
16 17 18 19 20
```

Colours/status indicate:

- Unanswered
- Answered
- Current

---

# 10. Exam interruption is a BIG consideration

Nigeria has:

- unstable electricity
- unstable internet
- shared computer labs
- old computers
- network congestion

So we **cannot design this like a normal web form**.

The exam experience should tolerate temporary connectivity loss.

Conceptually:

> **An answer should be preserved immediately, even if the network temporarily disappears.**

The student shouldn't lose question 37 because the school network blinked for five seconds.

We'll discuss the technical implementation later, but this requirement needs to be part of the product specification now.

---

# 11. Teacher

Teachers are primarily **question creators and exam creators**.

Their workflow should be:

```text
Teacher
   ↓
Select Subject
   ↓
Question Bank
   ↓
Create Questions
   ↓
Submit Questions
   ↓
HOD Review
   ↓
Approved
   ↓
Create Exam
```

---

# 12. Question Bank

This needs to be one of the strongest parts of the platform.

A teacher shouldn't simply create:

> "Question 1"

Instead every question should have metadata.

For example:

```text
Subject: Mathematics
Class: SS2
Department: Science
Topic: Quadratic Equations
Difficulty: Medium
Question Type: Multiple Choice
Status: Approved
```

Then the actual question.

---

# 13. Question types

I recommend supporting the following initially:

### MVP

**Multiple Choice**

```text
What is 2 + 2?

A. 3
B. 4
C. 5
D. 6

Correct answer: B
```

**True/False**

```text
The Earth is flat.

True
False
```

But eventually:

### More advanced

- Multiple-select
- Fill-in-the-blank
- Short answer
- Essay/theory
- Matching
- Image-based questions

However, **automatic marking becomes more complicated** once we move away from objective questions.

For the first production version, I'd make **objective CBT** the core.

---

# 14. Question creation

Teacher should be able to create:

### Question

- Question text
- Image attachment
- Question type
- Options
- Correct answer
- Explanation (optional)
- Subject
- Class
- Topic
- Difficulty
- Marks

For example:

```text
Question:
Which of the following is a prime number?

Options:
A. 21
B. 27
C. 29
D. 33

Correct Answer:
C

Marks:
1

Difficulty:
Easy
```

---

# 15. Question status

Questions should have lifecycle states.

Something like:

```text
DRAFT
   ↓
SUBMITTED
   ↓
UNDER REVIEW
   ↓
APPROVED
   ↓
REJECTED
```

And potentially:

```text
APPROVED
   ↓
ARCHIVED
```

This is important because teachers shouldn't be able to modify an already-approved question that's currently being used in an exam.

---

# 16. HOD

The HOD is the **academic quality-control layer**.

This is a very good feature in your original concept.

Teacher creates questions.

HOD reviews them.

HOD can:

- View questions
- Comment
- Approve
- Reject
- Request modification

For example:

> **Rejected**

Reason:

> "Option B and C are both mathematically valid. Please correct the question."

Teacher receives the feedback.

Then:

```text
Rejected
 ↓
Teacher edits
 ↓
Resubmits
 ↓
HOD reviews again
```

This creates a proper academic workflow.

---

# 17. HOD shouldn't necessarily see everything

A Mathematics HOD shouldn't see Biology questions.

So HOD permissions should be based on:

**Department / Subject assignment.**

For example:

```text
HOD: Mathematics
Can review:
✓ Mathematics
✓ Further Mathematics

Cannot review:
✗ Biology
✗ Economics
✗ Literature
```

This should be configurable.

---

# 18. Exam creation

This is different from question creation.

Teacher goes:

**Create Exam**

Then:

### Basic information

```text
Exam Name:
First Term Mathematics Examination

Class:
SS2A

Subject:
Mathematics

Department:
Science

Duration:
60 minutes

Start:
10:00 AM

End:
11:00 AM
```

Then choose questions.

---

# 19. How questions are selected

There are two modes I'd strongly consider.

### Mode A — Manual selection

Teacher selects questions.

```text
Question Bank

☑ Question 1
☑ Question 5
☑ Question 9
☑ Question 17
☑ Question 24
```

### Mode B — Random selection

This becomes very useful later.

Teacher says:

> Generate 50 questions from Mathematics SS2.

Then:

```text
Topic:
Quadratic Equations

Difficulty:
Any

Number:
10
```

The system randomly selects from approved questions.

This can also reduce cheating.

---

# 20. Question randomization

Another important feature.

For an exam, we can randomize:

### Question order

Student A:

```text
1 → Q15
2 → Q7
3 → Q32
```

Student B:

```text
1 → Q3
2 → Q27
3 → Q11
```

And potentially:

### Option order

Student A:

```text
A. 10
B. 15
C. 20
D. 25
```

Student B:

```text
A. 20
B. 25
C. 10
D. 15
```

Same exam. Different presentation.

This is **very valuable in school CBT environments**.

---

# 21. Exam approval

I wouldn't let a teacher immediately publish an exam.

I'd introduce:

```text
DRAFT
 ↓
SUBMITTED
 ↓
APPROVED
 ↓
SCHEDULED
 ↓
LIVE
 ↓
COMPLETED
 ↓
ARCHIVED
```

However, whether the HOD must approve the **exam itself** or only the **questions** is a product decision.

My recommendation:

### HOD approves questions.

Once questions are approved, teachers can construct exams using approved questions.

Then the teacher can schedule the exam without requiring another HOD approval every time.

Otherwise the HOD becomes a bottleneck.

---

# 22. Exam states

The platform needs strict exam states.

### Draft

Teacher is building it.

### Scheduled

Exam has a future start time.

### Live

Students can take it.

### Closed

Students can no longer start it.

### Completed

All attempts have been finalized.

### Archived

Historical record.

This will make the system much easier to reason about.

---

# 23. Results

Results should be automatically calculated.

For example:

```text
MATHEMATICS
SS2A

Student              Score       %
------------------------------------------------
Ahmed Bello          43/50       86%
David John           39/50       78%
Mary James           47/50       94%
```

Teacher can view results **only for subjects/classes they're assigned to**.

That's important.

A Mathematics teacher shouldn't see every school's results.

---

# 24. What should teachers see?

Teacher dashboard:

```text
My Subjects
----------------
Mathematics

My Classes
----------------
SS1A
SS1B
SS2A

Recent Exams
----------------
First CA
Mid-Term Test
First Term Examination
```

And:

**Results**

```text
Exam:
First Term Mathematics Examination

Students: 42
Attempted: 41
Absent: 1

Average: 68.4%
Highest: 96%
Lowest: 31%
```

Then individual results.

---

# 25. Export

Teacher can export:

**CSV**

```text
Student ID
Student Name
Class
Score
Percentage
Status
Submitted At
```

Potentially later:

- Excel
- PDF
- Printable result sheet

---

# 26. Student results

We need to decide whether students can see their results.

I strongly recommend:

### Yes, but configurable by School Admin.

School could choose:

**Show result immediately after exam**

or

**Hide result until teacher publishes it**

or

**Never show detailed result to student**

Because different schools will have different policies.

---

# 27. Result publication

This is a useful concept.

After an exam:

```text
Exam Completed
       ↓
Results Calculated
       ↓
Teacher reviews
       ↓
Publish Results
       ↓
Students can view
```

But for objective CBT, the result is already calculated.

So publication is primarily a **visibility control**, not a marking process.

---

# 28. Student result page

If enabled:

```text
Mathematics
First Term Examination

Score
43 / 50

Percentage
86%

Grade
A
```

Potentially:

```text
Correct: 43
Incorrect: 7
Unanswered: 0
```

But I'd make **question-by-question review configurable**.

Some schools may not want students seeing the correct answers.

---

# 29. Classes

We need to define classes properly.

A class shouldn't simply be:

> SS2

It should be an actual school class/group.

Example:

```text
Level: SS2
Arm: A
Display Name: SS2A
Department: Science
```

Or:

```text
SS2 Science A
SS2 Science B
SS2 Arts A
SS2 Commercial A
```

This matters because Nigerian schools commonly have multiple arms.

---

# 30. Departments

Your initial list:

- All
- Science
- Business
- Humanities

is fine, but I would **not hard-code these as the only departments**.

Instead:

> School Admin can create/manage departments.

We can provide defaults:

```text
Science
Business
Humanities
```

but allow:

```text
Technical
General
Arts
Vocational
Other
```

This makes the product usable beyond one school structure.

---

# 31. Subjects

Subjects should also be school-configurable.

For example:

**Science**

- Mathematics
- Physics
- Chemistry
- Biology

**Business**

- Economics
- Accounting
- Commerce

**Humanities**

- Literature
- Government
- History

But schools can add their own subjects.

---

# 32. Teacher assignment

A teacher shouldn't just be assigned "Mathematics".

They should have:

```text
Teacher:
Mr. Ahmed

Subjects:
✓ Mathematics

Classes:
✓ SS1A
✓ SS1B
✓ SS2A

Department:
Science
```

This determines what the teacher can access.

---

# 33. Permissions should be contextual

This is extremely important.

Instead of:

> Teacher can manage questions.

The actual rule should be:

> Teacher can manage questions **for subjects/classes assigned to them**.

Same for results.

This prevents accidental access across departments/classes.

---

# 34. User identity

We should separate:

### User account

From:

### Academic profile

For example:

```text
Account
--------
Username
Password
Status
Role

Academic Profile
----------------
Student ID
Name
Class
Department
Session
```

This will make future changes much easier.

---

# 35. Student promotion

Another feature you haven't mentioned:

**What happens next academic session?**

This is a major school requirement.

At the end of the session:

```text
2026/2027
      ↓
Promote Students
      ↓
SS1 → SS2
SS2 → SS3
SS3 → Alumni/Graduated
```

Students shouldn't have to be recreated every year.

The school should be able to run:

> **End of Session / Promote Students**

with review before committing.

---

# 36. Academic sessions

We should therefore introduce:

**Academic Session**

Example:

```text
2026/2027
```

and:

**Term**

```text
First Term
Second Term
Third Term
```

Every exam should belong to:

```text
Session
Term
Class
Subject
```

That becomes extremely important for historical reporting.

---

# 37. Examination types

Don't hard-code only "Exam".

Allow schools to define examination types.

Defaults:

- CA 1
- CA 2
- Mid-Term Test
- Examination
- Mock Examination
- Entrance Examination

Then an exam can be:

```text
2026/2027
First Term
SS2
Mathematics
First CA
```

---

# 38. Exam scheduling

We need to distinguish:

### Availability window

When students are allowed to start.

Example:

```text
Starts:
10:00 AM

Closes:
12:00 PM
```

### Exam duration

Once a student starts:

```text
60 minutes
```

This means someone who starts at 11:30 doesn't get until 12:30 if the exam closes at 12:00—**unless the school chooses a different policy**.

We need to explicitly define this later.

---

# 39. Attendance / absent students

The system should automatically know:

```text
Registered: 50

Attempted: 47
Absent: 3
```

Potentially:

```text
Not Started
Started
Submitted
Auto-submitted
Absent
```

This is useful for school administration.

---

# 40. Exam attempt

Every student taking an exam creates an **attempt**.

An attempt should have a lifecycle:

```text
NOT_STARTED
     ↓
IN_PROGRESS
     ↓
SUBMITTED
```

or:

```text
IN_PROGRESS
     ↓
TIME_EXPIRED
     ↓
AUTO_SUBMITTED
```

This gives us reliable records.

---

# 41. Cheating controls

Because this is CBT, we should think about cheating **at product level**, even before technology.

Possible controls:

### Basic

- Random question order
- Random option order
- One attempt
- Timer
- Auto-submit
- Disable returning after submission

### More advanced

- Full-screen mode
- Detect tab switching
- Detect leaving exam window
- Warning after leaving
- Maximum violations
- Lock exam after repeated violations

### Exam lab mode

Potentially:

> **Secure CBT Mode**

where schools can enable stricter restrictions.

But I wouldn't make aggressive proctoring part of MVP.

---

# 42. Question import

Another thing I'd add.

Teachers should not be forced to manually type 500 questions.

We should eventually support:

> **Import Questions**

CSV/Excel template.

For example:

```text
Question
Option A
Option B
Option C
Option D
Correct Answer
Subject
Class
Topic
Difficulty
Marks
```

The platform validates everything before importing.

This could become a **huge selling point**.

---

# 43. Images and equations

Very important for Nigerian secondary schools.

Questions aren't always plain text.

We need to eventually support:

- Images
- Mathematical notation
- Equations
- Diagrams
- Chemistry structures
- Graphs

For example:

> "Study the diagram below and answer..."

Therefore, the question editor should eventually support rich content rather than just a plain text box.

---

# 44. Results beyond individual students

The platform should eventually provide **analytics**.

For a teacher:

### Class performance

```text
Average: 64%
Highest: 94%
Lowest: 21%
Pass rate: 78%
```

### Question analysis

This is especially interesting.

```text
Question       Correct %
--------------------------------
Q1               94%
Q2               81%
Q3               37%
Q4               89%
Q5               22%
```

Now the teacher can identify difficult questions.

Later we can calculate:

**Question difficulty index**

This could become valuable academically.

---

# 45. HOD analytics

HOD should see performance across their department.

For example:

```text
Science Department

Mathematics     71%
Physics         64%
Chemistry       68%
Biology         75%
```

Then compare classes:

```text
SS2A   74%
SS2B   68%
SS2C   61%
```

This is more useful than simply giving HOD access to questions.

---

# 46. School Admin analytics

School Admin gets the broadest school-level view.

```text
Students:       1,245
Teachers:          86
Classes:           31
Subjects:          42

Exams this term:  127
Attempts:       14,382

Average score:    67.8%
```

But they shouldn't necessarily see the actual content of every question unless permitted.

---

# 47. School branding

I really like your approach here.

Keep it simple.

During initial school setup:

### Step 1

Upload logo.

### Step 2

Choose primary colour.

### Step 3

Preview.

```text
        [School Logo]

        Welcome to
        King's College CBT

        [Login]
```

Then the entire platform adopts the school's identity.

We should also generate a **school-branded student exam experience**.

That gives the product a much stronger "this is our school's CBT platform" feel.

---

# 48. Subscription

I would make subscription a **platform-level concern**, not something school admins manage deeply.

School sees:

```text
Subscription

Plan: Annual
Status: Active
Expires: 31 August 2027

Days remaining: 373
```

When expired:

```text
Subscription Expired

Please contact your software administrator
to renew access.
```

But importantly:

**Do not immediately delete school data.**

The school becomes inaccessible/read-only or fully locked depending on your business policy.

Data should remain recoverable after renewal.

---

# 49. Activation key

Your idea of a yearly key is good.

Conceptually:

```text
Software Admin
      ↓
Creates/Renews School
      ↓
Generates activation key
      ↓
School enters key
      ↓
Subscription activated
```

But I would treat the key as an **activation mechanism**, not the actual security mechanism.

The school shouldn't need to repeatedly enter it.

Once activated:

```text
School ID
Subscription
Expiry
Status
```

are associated with the school account.

---

# 50. One major thing I'd change

I would **not make the School Admin responsible for setting up everything manually**.

We should have a guided:

# School Setup Wizard

First login:

### Step 1 — School information

```text
School Name
School Logo
Primary Colour
```

### Step 2 — Academic session

```text
2026/2027
```

### Step 3 — Departments

```text
☑ Science
☑ Business
☑ Humanities
+ Add Department
```

### Step 4 — Classes

```text
JSS1A
JSS1B
JSS2A
...
```

### Step 5 — Subjects

```text
Mathematics
English
Physics
...
```

### Step 6 — Staff

Import/create:

```text
Moderators
HODs
Teachers
```

### Step 7 — Students

Import students.

### Step 8 — Done

```text
Your school is ready for CBT.
```

This dramatically reduces onboarding friction.

---

# 51. The complete product workflow

If we zoom all the way out, the product becomes:

```text
                  SOFTWARE ADMIN
                         │
                         ▼
                    CREATE SCHOOL
                         │
                         ▼
                  SUBSCRIPTION ACTIVE
                         │
                         ▼
                   SCHOOL ADMIN
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
       SCHOOL SETUP             MODERATORS
             │                       │
       ┌─────┼─────┐          Manage Users
       ▼     ▼     ▼
   Classes Subjects Departments
             │
             ▼
          TEACHERS
             │
             ▼
        QUESTION BANK
             │
             ▼
          SUBMIT
             │
             ▼
            HOD
             │
       ┌─────┴─────┐
       ▼           ▼
    APPROVE      REJECT
       │           │
       │           └──────► Teacher
       ▼
   APPROVED QUESTIONS
       │
       ▼
     TEACHER
       │
       ▼
   CREATE EXAM
       │
       ▼
    SCHEDULE
       │
       ▼
     STUDENTS
       │
       ▼
    TAKE EXAM
       │
       ▼
   AUTO MARKING
       │
       ▼
     RESULTS
       │
   ┌───┼───────────┐
   ▼   ▼           ▼
Student Teacher    HOD
   │      │         │
   │      │         ▼
   │      │      Department
   │      │      Analytics
   │      ▼
   │   Class/Exam
   │   Analytics
   ▼
Result Visibility
```

---

# 52. What I think the MVP should actually contain

I would **not** attempt to build every feature we've mentioned in V1.

The production MVP should have these pillars:

### School

- School registration/activation
- Subscription status
- School branding
- Academic session
- Departments
- Classes
- Subjects

### Users

- Student management
- Teacher management
- HOD management
- Moderator management
- Role-based access

### Questions

- Question bank
- MCQ
- Question metadata
- Image support
- Draft
- Submit
- HOD approve/reject
- Question import

### Exams

- Create exam
- Select approved questions
- Duration
- Schedule
- Randomize questions
- Randomize options
- One attempt
- Auto-submit

### CBT

- Student exam interface
- Timer
- Navigation
- Answer persistence
- Exam submission
- Basic anti-cheating measures

### Results

- Automatic marking
- Student results
- Teacher results
- Class performance
- Question performance
- CSV export

### Platform

- Software Admin
- School management
- Activation keys
- Subscription expiry
- School metrics

That is already a **serious production product**.

---

# 53. Features I'd deliberately leave for V2+

Things like:

- Essay marking
- AI-generated questions
- AI question evaluation
- Advanced proctoring
- Webcam monitoring
- Facial recognition
- Advanced psychometrics
- Parent portal
- Mobile apps
- Payment gateway
- Result transcripts
- Report cards
- LMS features
- Learning materials
- Homework
- Attendance
- Messaging

Those are tempting, but they start turning this into an LMS/SIS.

**We should resist that.**

The product's identity should remain:

> **A professional CBT examination platform built specifically for secondary schools.**

---

# 54. One more architectural/product principle

I think we should treat these as **four completely separate domains**:

### 1. School Management

Who belongs to the school?

```text
Students
Teachers
HODs
Moderators
Classes
Subjects
Departments
```

### 2. Question Management

What can be asked?

```text
Question Bank
Questions
Answers
Topics
Difficulty
Approval
```

### 3. Examination Management

What is being administered?

```text
Exam
Questions
Schedule
Duration
Attempts
Rules
```

### 4. Result Management

What happened?

```text
Attempts
Answers
Scores
Performance
Analytics
Reports
```

This separation will be **extremely important when we eventually move into architecture**.

---

## Where I'd take the discussion next

Before we touch database schemas, APIs, frontend, backend, etc., I think we should now go **one level deeper into the product specification**.

Specifically, we should settle these six things:

1. **Exact role/permission matrix** — every role and exactly what they can see/do.
2. **School setup/onboarding flow** — exactly what happens from the moment a school receives its activation key.
3. **Question lifecycle** — creation → editing → submission → HOD review → approval → exam → archival.
4. **Exam lifecycle** — creation → scheduling → student attempt → interruption → submission → marking → publication.
5. **Result system** — exactly who sees what, when, and what analytics each role gets.
6. **Edge cases** — power failure, internet loss, student disconnecting, duplicate accounts, missed exams, changing classes, teacher leaving school, expired subscription during an exam, etc.

**I would recommend we tackle the permission matrix first**, because once we get that right, the rest of the product becomes much easier to define.

Yes. I agree with your correction, and I think it actually makes the product **better suited to the realities of Nigerian school CBT labs**.

The important distinction is:

> **An exam is not scheduled to a clock. An exam is made available by an authorized person, and each student's attempt has its own clock.**

That should become a core product principle.

And I completely agree with your second point: **we should not artificially cripple the MVP.** We're defining the first production release, not a throwaway prototype. We can distinguish between _core scope_ and _future expansion_, but everything we've already agreed belongs in the core product unless we deliberately decide otherwise.

---

# 1. Replace "Exam Scheduling" with "Exam Activation"

I would remove the previous concept of:

> Start: 10:00 AM
> End: 11:00 AM

as the primary exam mechanism.

Instead:

### Exam configuration

The teacher creates:

**Mathematics — First Term Examination**

```text
Class: SS2A
Subject: Mathematics
Duration: 60 minutes
Questions: 50
Attempts allowed: 1
Status: Draft
```

Then the teacher/invigilator has:

**Activate Exam**

Once activated:

```text
Exam Status: ACTIVE
```

Students in the appropriate class can now see:

> **Mathematics Examination — Available Now**

---

# 2. The student's clock begins only when they start

This is the crucial distinction.

Suppose the teacher activates the exam at 9:00 AM.

Student A starts at:

**9:04 AM**

Their timer:

**60:00**

Student B starts at:

**9:11 AM**

Their timer:

**60:00**

Student C starts at:

**9:57 AM**

Their timer:

**60:00**

There isn't a global exam clock.

There is an **individual attempt clock**.

---

# 3. Your 40-student / 20-computer example works perfectly

Let's say:

**40 students**

**20 computers**

Exam duration:

**60 minutes**

Teacher activates the exam.

### Batch 1

20 students enter.

```text
Student 1 → Started 9:00
Student 2 → Started 9:02
...
Student 20 → Started 9:05
```

Each has their own 60-minute timer.

At approximately 10:00–10:05, those students finish.

Teacher can now activate/allow the next batch.

### Batch 2

Remaining 20 students start.

```text
Student 21 → Started 10:04
Student 22 → Started 10:06
...
Student 40 → Started 10:10
```

Each gets their own 60 minutes.

**The exam itself remains the same exam.**

This is important.

We don't create:

> Mathematics Exam Batch 1
> Mathematics Exam Batch 2

Instead, there is:

> **Mathematics First Term Examination**

with 40 individual attempts.

---

# 4. But I would add one important concept: Exam Availability

There should be a distinction between:

### Exam

The actual assessment.

and

### Availability

Whether students are currently allowed to start it.

So:

```text
Exam
  │
  ├── Questions
  ├── Rules
  ├── Duration
  ├── Class
  └── Subject
        │
        ▼
    Availability
        │
        ▼
     Attempts
```

An exam can be:

**DRAFT**

**READY**

**ACTIVE**

**PAUSED**

**COMPLETED**

**ARCHIVED**

---

# 5. I would add PAUSED

This becomes extremely useful in real-world CBT.

Suppose Batch 1 is taking the exam and suddenly:

- power goes out
- lab network fails
- fire drill happens
- invigilator needs to stop the exam
- school needs to suspend the session

The teacher can:

> **Pause Exam**

But we need to define exactly what pause means.

My recommendation:

### Pause = prevent new students from starting.

It should **not automatically destroy or invalidate students who are already taking the exam**.

Existing attempts remain preserved.

This gives us a safer model.

---

# 6. We should have two different actions

Instead of just:

> Activate Exam

I'd use:

### Open for Students

Allows eligible students who haven't started to begin.

### Close for New Attempts

Prevents new students from starting.

Existing attempts can continue until their individual timers expire.

This gives the invigilator much more control.

For example:

```text
Mathematics Examination

Status: OPEN

[Close for New Attempts]
```

Then:

```text
Status: CLOSED

[Reopen for Students]
```

That is much more practical than a rigid clock.

---

# 7. Individual attempt lifecycle

Every student's attempt should have its own status.

Something like:

```text
NOT STARTED
     │
     ▼
IN PROGRESS
     │
     ├─────────────┐
     ▼             ▼
 SUBMITTED     TIME EXPIRED
                   │
                   ▼
             AUTO SUBMITTED
```

And potentially:

```text
CANCELLED
INVALIDATED
ABSENT
```

But we need to be careful with **Absent**.

---

# 8. Absent should be an attendance/result status, not an attempt status

This is a subtle but important distinction.

If Ahmed never starts:

```text
Student: Ahmed
Exam: Mathematics
Participation: ABSENT
Attempt: NONE
```

There isn't an "attempt" to mark as absent.

If Ahmed starts and submits:

```text
Participation: PRESENT
Attempt: SUBMITTED
Score: 82%
```

If Ahmed starts but his time expires:

```text
Participation: PRESENT
Attempt: AUTO-SUBMITTED
Score: 74%
```

This distinction will make reporting much cleaner.

---

# 9. Individual activation for absentees

I strongly agree with your idea here.

Suppose 40 students are registered.

35 take the exam.

5 are absent.

The exam shouldn't be recreated.

The teacher sees:

```text
Mathematics Examination

40 Students

Completed       35
In Progress      0
Absent           5
```

Then:

**Manage Access**

```text
☐ Ahmed Bello
☐ John Smith
☐ Mary James
☐ David Peter
☐ Sarah Ali
```

Teacher can select:

**Allow Selected Students**

Now those students can access the existing exam.

Their attempts become new individual attempts associated with the **same examination**.

Historical reporting remains intact.

---

# 10. But we need to preserve the original absence

This is another subtle point.

Suppose:

**Exam Day**

Ahmed:

> Absent

Later:

> Makeup attempt authorized.

We shouldn't rewrite history and pretend Ahmed attended the original sitting.

Instead:

```text
Original Sitting
----------------
Ahmed
Status: Absent


Makeup
----------------
Ahmed
Status: Completed
Score: 78%
Authorized by: Teacher
Date: ...
```

Then the school can see:

> **Original attendance: Absent**
> **Makeup: Completed**

This is much more academically defensible.

---

# 11. We should introduce "Attempt Session"

This concept will solve several problems.

One examination can have multiple attempt sessions.

For example:

```text
EXAMINATION
Mathematics First Term Exam
       │
       ├── Session 1
       │      Batch 1
       │      20 students
       │
       ├── Session 2
       │      Batch 2
       │      20 students
       │
       └── Makeup Session
              3 students
```

But these don't need to be separate exams.

They're **sessions/availability windows for the same exam**.

This also gives the school excellent reporting.

---

# 12. Who should activate it?

You suggested teacher.

I agree, **but I would expand the permission slightly.**

Authorized roles:

### Teacher

Can activate exams they created for their assigned classes/subjects.

### HOD

Can activate exams within their department if permitted.

### Moderator

Can assist with exam administration.

### School Admin

Can activate/deactivate anything within the school.

But the default operational workflow should be:

> **Teacher / Invigilator activates the exam.**

We can eventually introduce a dedicated:

### Invigilator

role, but **I don't think we need another permanent system role yet.**

Instead, we can give authorized teachers the ability to act as invigilators.

---

# 13. The student portal should remain extremely focused

I agree strongly with your point:

> "This is an assessment portal, not a personal account or social app."

The student shouldn't log in and see:

```text
Upcoming Exams
Tomorrow's Exams
Next Week's Exams
Exam Calendar
Notifications
```

That adds noise.

Instead:

### Student dashboard

```text
Welcome, Ahmed

AVAILABLE ASSESSMENT

Mathematics
First Term Examination

50 Questions
60 Minutes

[START EXAM]
```

If nothing is active:

```text
No assessment is currently available.

Please wait for your teacher or invigilator.
```

That's it.

Very focused.

---

# 14. But students should still have historical results

I would keep this separate.

Maybe:

```text
Assessment
Results
```

The student can see previously published results.

But the home screen remains about **what is available right now**.

---

# 15. We should introduce an "Exam Control Center"

This is something I think will become one of the strongest features of the platform.

When a teacher activates an exam, they shouldn't just press a button.

They get:

# Exam Control Center

```text
Mathematics
First Term Examination

Status: OPEN

Registered: 40
Started: 20
Completed: 4
In Progress: 16
Not Started: 20
Absent: 0
```

And actions:

**Close New Attempts**

**View Live Attempts**

**View Students**

**Allow Selected Students**

**End Exam**

This is effectively the teacher's **invigilation dashboard**.

---

# 16. Live monitoring

Without going into advanced proctoring, the teacher can see:

```text
Student              Status          Time Remaining
---------------------------------------------------
Ahmed Bello          In Progress     42:15
David John           In Progress     38:07
Mary James           Submitted       —
Sarah Ali            In Progress     51:22
John Peter           Not Started     —
```

This is extremely useful in a physical CBT lab.

The teacher can immediately know:

> Who has started?

> Who hasn't?

> Who has finished?

> Who is still writing?

---

# 17. The system should also handle lab constraints

We shouldn't build a "20 computer limit" into the examination itself.

Instead, the **school controls how many students are activated at a time**.

This is important because another school might have:

**100 computers for 100 students.**

They activate everyone.

Another school might have:

**10 computers for 100 students.**

They activate 10 at a time.

The software doesn't care.

---

# 18. This also makes the platform useful outside physical CBT labs

The same mechanism works for:

- School computer lab
- Classroom laptops
- Tablets
- Students' personal computers
- Remote assessment

The underlying model stays the same:

> **Authorized → Available → Student starts → Individual timer → Submit → Result**

---

# 19. One thing I would add: access eligibility

When an exam is activated, the system shouldn't simply say:

> Everyone in the school can see Mathematics.

Eligibility should be determined by:

```text
Exam
 ↓
Subject
 ↓
Class
 ↓
Eligible students
```

So if the exam is:

**SS2A Mathematics**

only students assigned to:

**SS2A**

can see it.

Even if another student somehow knows the exam exists, they can't start it.

---

# 20. Exam activation should therefore have three layers

I think this is the final model I'd recommend:

### Layer 1 — Exam Configuration

Teacher builds:

```text
Questions
Duration
Rules
Class
Subject
Marks
Randomization
Attempts
```

### Layer 2 — Exam Activation

Authorized person opens it:

```text
OPEN
```

### Layer 3 — Individual Attempt

Student starts:

```text
START
 ↓
Timer begins
 ↓
Answer
 ↓
Submit
 ↓
Mark
```

That's much cleaner than global start/end times.

---

# 21. And yes — I agree on scope

I want to correct the framing from my previous response.

When I said:

> "What the MVP should actually contain"

I was thinking in conventional startup terms:

> "Build the smallest viable version."

But **that's not the product you're describing.**

You're saying:

> We're building the first production release of a serious commercial CBT platform.

That's different.

So I agree with your position.

### We should include the full scope we've established.

That means the initial production version should include the complete foundation we've discussed:

- Multi-school architecture concept
- School onboarding
- Subscription/access management
- Branding
- Logo
- Departments
- Classes
- Subjects
- Academic sessions
- Terms
- Students
- Teachers
- HODs
- Moderators
- School Admin
- Software Admin
- Bulk user import
- Question bank
- Question metadata
- Question types
- Question import
- Rich question content
- Question approval workflow
- HOD review
- Exam builder
- Approved-question enforcement
- Exam activation
- Batch-based exam administration
- Individual timers
- Exam Control Center
- Live attempt monitoring
- Answer persistence
- Automatic submission
- Random question ordering
- Random option ordering
- Absence management
- Makeup attempts
- Result publication
- Student results
- Teacher results
- HOD analytics
- School analytics
- Question analytics
- CSV export
- Subscription lifecycle
- Activation keys
- Historical records
- Student promotion
- Exam archival
- Audit/history
- Proper role-based access
- School isolation
- Branding/theme system

And **anything else we identify during product design that is necessary for a production-grade CBT platform.**

The distinction is simply that we don't need to put things like AI proctoring, facial recognition, parent portals, or LMS functionality into the first release unless we later decide they're strategically important.

---

# 22. I think we've just established an important product philosophy

I'd summarize the product as:

> **A school-centric examination platform where schools control their academic structure, teachers control assessment content, HODs enforce academic quality, authorized staff control examination availability, students receive focused assessment experiences, and the platform automatically preserves the entire examination and result history.**

And the most important CBT principle is:

> **Exams are centrally defined, but attempts are individually timed and controlled.**

That solves your batch problem elegantly without compromising the examination model.

---

## Next: let's lock down the Permission Matrix

I think we should **not jump into architecture yet**.

The next thing I'd do is take the six roles:

**Software Admin → School Admin → Moderator → HOD → Teacher → Student**

and go through **every single module**

That will become our **canonical product permission model**, and then we can use it to design every subsequent workflow.
