Absolutely. Based on everything we've established, I would make this the **canonical permission model for the product**.

One important principle: permissions should not be based on role alone. They should also be constrained by **school, department, class, subject, ownership, and exam status**. A teacher may have permission to manage questions, for example, but only for subjects/classes assigned to that teacher.

# CBT Platform Permission Matrix

### Legend

**Full** = Create, View, Edit, Delete/manage where appropriate
**View** = Read-only
**Scoped** = Only within the user's assigned school/classes/subjects/departments
**—** = No access
**System** = Platform-level authority

| Module / Action                 | Software Admin | School Admin      | Moderator  | HOD              | Teacher                   | Student               |
| ------------------------------- | -------------- | ----------------- | ---------- | ---------------- | ------------------------- | --------------------- |
| **Platform / School**           |                |                   |            |                  |                           |                       |
| View all schools                | Full           | —                 | —          | —                | —                         | —                     |
| Create school                   | Full           | —                 | —          | —                | —                         | —                     |
| Activate school                 | Full           | —                 | —          | —                | —                         | —                     |
| Suspend school                  | Full           | —                 | —          | —                | —                         | —                     |
| Renew subscription              | Full           | —                 | —          | —                | —                         | —                     |
| Revoke school access            | Full           | —                 | —          | —                | —                         | —                     |
| View subscription status        | Full           | View own school   | —          | —                | —                         | —                     |
| View school metrics             | Full           | Full own school   | Limited    | Department       | Own classes/subjects      | Own results           |
| Platform audit/logs             | Full           | Own school        | Limited    | Limited          | Limited                   | —                     |
| **School Configuration**        |                |                   |            |                  |                           |                       |
| View school profile             | Full           | Full              | View       | View             | View                      | Limited               |
| Edit school name/details        | Full           | Full              | —          | —                | —                         | —                     |
| Upload/change logo              | Full           | Full              | —          | —                | —                         | —                     |
| Set primary colour              | Full           | Full / One-time   | —          | —                | —                         | —                     |
| Manage departments              | Full           | Full              | Full       | View             | —                         | —                     |
| Manage classes                  | Full           | Full              | Full       | View             | —                         | —                     |
| Manage subjects                 | Full           | Full              | Full       | View             | —                         | —                     |
| Manage academic sessions        | Full           | Full              | Full       | View             | —                         | —                     |
| Manage terms                    | Full           | Full              | Full       | View             | —                         | —                     |
| Manage school settings          | Full           | Full              | Limited    | —                | —                         | —                     |
| **User Management**             |                |                   |            |                  |                           |                       |
| Create Moderator                | Full           | Full              | —          | —                | —                         | —                     |
| Edit Moderator                  | Full           | Full              | —          | —                | —                         | —                     |
| Remove Moderator                | Full           | Full              | —          | —                | —                         | —                     |
| Create HOD                      | Full           | Full              | Full       | —                | —                         | —                     |
| Edit HOD                        | Full           | Full              | Full       | —                | —                         | —                     |
| Remove HOD                      | Full           | Full              | Full       | —                | —                         | —                     |
| Create Teacher                  | Full           | Full              | Full       | —                | —                         | —                     |
| Edit Teacher                    | Full           | Full              | Full       | —                | —                         | —                     |
| Deactivate Teacher              | Full           | Full              | Full       | —                | —                         | —                     |
| Reset Teacher credentials       | Full           | Full              | Full       | —                | —                         | —                     |
| Create Student                  | Full           | Full              | Full       | —                | —                         | —                     |
| Edit Student                    | Full           | Full              | Full       | —                | —                         | —                     |
| Deactivate Student              | Full           | Full              | Full       | —                | —                         | —                     |
| Reset Student credentials       | Full           | Full              | Full       | —                | —                         | —                     |
| Import Teachers                 | Full           | Full              | Full       | —                | —                         | —                     |
| Import Students                 | Full           | Full              | Full       | —                | —                         | —                     |
| Export Users                    | Full           | Full              | Full       | Scoped           | Scoped                    | —                     |
| **Assignments**                 |                |                   |            |                  |                           |                       |
| Assign teacher → subject        | Full           | Full              | Full       | Limited/request  | —                         | —                     |
| Assign teacher → class          | Full           | Full              | Full       | Limited/request  | —                         | —                     |
| Assign HOD → department         | Full           | Full              | Full       | —                | —                         | —                     |
| Assign student → class          | Full           | Full              | Full       | —                | —                         | —                     |
| Move student between classes    | Full           | Full              | Full       | Request/approve  | —                         | —                     |
| Set subject registrations       | Full           | Full              | Full       | —                | Assigned electives¹       | —                     |
| View assignments                | Full           | Full              | Full       | Department       | Own                       | Own                   |
| **Question Bank**               |                |                   |            |                  |                           |                       |
| View question bank              | Full           | View              | View       | Department       | Assigned subjects/classes | —                     |
| Create question                 | —              | —                 | —          | —                | Scoped                    | —                     |
| Edit own draft question         | —              | —                 | —          | —                | Full scoped               | —                     |
| Delete own draft question       | —              | —                 | —          | —                | Full scoped               | —                     |
| Submit question for review      | —              | —                 | —          | —                | Scoped                    | —                     |
| Review submitted questions      | —              | View              | —          | Full department  | —                         | —                     |
| Comment on question             | —              | View              | —          | Full department  | Respond to feedback       | —                     |
| Approve question                | —              | —                 | —          | Full department  | —                         | —                     |
| Reject question                 | —              | —                 | —          | Full department  | —                         | —                     |
| Request changes                 | —              | —                 | —          | Full department  | —                         | —                     |
| Archive question                | Full           | Limited           | Limited    | Department       | Own/assigned              | —                     |
| Import questions                | Full           | Limited           | Full       | Department       | Full scoped               | —                     |
| Export questions                | Full           | Limited           | Full       | Department       | Scoped                    | —                     |
| **Question Lifecycle**          |                |                   |            |                  |                           |                       |
| Create Draft                    | —              | —                 | —          | —                | ✓                         | —                     |
| Submit                          | —              | —                 | —          | —                | ✓                         | —                     |
| Under Review                    | View           | View              | View       | ✓                | View                      | —                     |
| Approved                        | View           | View              | View       | ✓                | View                      | —                     |
| Rejected                        | View           | View              | View       | ✓                | Edit & resubmit           | —                     |
| Archived                        | Full           | View              | View       | Scoped           | Scoped                    | —                     |
| **Exam Management**             |                |                   |            |                  |                           |                       |
| View all exams                  | Full           | Full              | Full       | Department       | Assigned                  | Available only        |
| Create exam                     | —              | Limited           | Limited    | Limited          | Full scoped               | —                     |
| Edit draft exam                 | —              | Full              | Full       | Scoped           | Full own exam             | —                     |
| Delete draft exam               | —              | Full              | Full       | Scoped           | Full own exam             | —                     |
| Add questions to exam           | —              | Full              | Full       | Scoped           | Full own exam             | —                     |
| Use approved questions          | —              | Full              | Full       | Full             | Full                      | —                     |
| Schedule/configure availability | —              | Full              | Full       | Scoped           | Full                      | —                     |
| Configure duration              | —              | Full              | Full       | Scoped           | Full                      | —                     |
| Configure randomization         | —              | Full              | Full       | Scoped           | Full                      | —                     |
| Configure attempts              | —              | Full              | Full       | Scoped           | Full                      | —                     |
| Publish/activate exam           | —              | Full              | Full       | Scoped           | Full                      | —                     |
| Pause exam                      | —              | Full              | Full       | Scoped           | Full during own exam      | —                     |
| Close new attempts              | —              | Full              | Full       | Scoped           | Full during own exam      | —                     |
| Reopen exam                     | —              | Full              | Full       | Scoped           | Own exam                  | —                     |
| Archive exam                    | Full           | Full              | Full       | Scoped           | Own exam                  | —                     |
| **Exam Administration**         |                |                   |            |                  |                           |                       |
| Exam Control Center             | Full           | Full              | Full       | Scoped           | Full own exam             | —                     |
| View registered students        | Full           | Full              | Full       | Department/class | Assigned class            | —                     |
| View live attempts              | Full           | Full              | Full       | Department       | Own exam                  | —                     |
| See who has started             | Full           | Full              | Full       | Department       | Own exam                  | —                     |
| See who has completed           | Full           | Full              | Full       | Department       | Own exam                  | —                     |
| Manually allow student          | Full           | Full              | Full       | Scoped           | Own exam                  | —                     |
| Grant makeup access             | Full           | Full              | Full       | Scoped           | Own exam                  | —                     |
| Mark/confirm absence            | Full           | Full              | Full       | Scoped           | Own exam                  | —                     |
| End individual attempt          | Full           | Full              | Full       | Scoped           | Own exam                  | —                     |
| Invalidate attempt              | Full           | Full              | Full       | Scoped           | Request / limited         | —                     |
| **Student CBT**                 |                |                   |            |                  |                           |                       |
| Login                           | ✓              | ✓                 | ✓          | ✓                | ✓                         | ✓                     |
| View active assessment          | —              | —                 | —          | —                | —                         | ✓                     |
| Start exam                      | —              | —                 | —          | —                | —                         | ✓                     |
| Answer questions                | —              | —                 | —          | —                | —                         | ✓                     |
| Navigate questions              | —              | —                 | —          | —                | —                         | ✓                     |
| Submit exam                     | —              | —                 | —          | —                | —                         | ✓                     |
| Auto-submit on timeout          | System         | System            | System     | System           | System                    | System                |
| Resume interrupted attempt      | —              | —                 | —          | —                | —                         | ✓                     |
| View previous results           | —              | —                 | —          | —                | —                         | Configurable          |
| **Results**                     |                |                   |            |                  |                           |                       |
| Automatic marking               | System         | System            | System     | System           | System                    | —                     |
| View exam results               | Full           | Full              | Full       | Department       | Own exams                 | Own published results |
| View individual student result  | Full           | Full              | Full       | Department       | Assigned students         | Own                   |
| View class performance          | Full           | Full              | Full       | Department       | Assigned classes          | —                     |
| View subject performance        | Full           | Full              | Department | Department       | Own subjects              | —                     |
| View question performance       | Full           | Full              | Department | Department       | Own exams                 | —                     |
| Export CSV                      | Full           | Full              | Full       | Department       | Own results               | —                     |
| Publish results                 | —              | Full              | Full       | Scoped           | Full own exam             | —                     |
| Unpublish results               | —              | Full              | Full       | Scoped           | Own exam                  | —                     |
| **Analytics**                   |                |                   |            |                  |                           |                       |
| Platform analytics              | Full           | —                 | —          | —                | —                         | —                     |
| School-wide analytics           | Full           | Full              | Full       | —                | —                         | —                     |
| Department analytics            | Full           | Full              | Limited    | Full             | —                         | —                     |
| Class analytics                 | Full           | Full              | Full       | Full             | Full assigned             | —                     |
| Student performance history     | Full           | Full              | Full       | Department       | Assigned students         | Own                   |
| Question difficulty analysis    | Full           | Full              | Department | Department       | Own exams                 | —                     |
| Exam completion statistics      | Full           | Full              | Full       | Department       | Own exams                 | —                     |
| **Reporting / Export**          |                |                   |            |                  |                           |                       |
| Export school data              | Full           | Full              | Full       | Scoped           | Scoped                    | —                     |
| Export exam results             | Full           | Full              | Full       | Scoped           | Own exam                  | —                     |
| Export student list             | Full           | Full              | Full       | Scoped           | Assigned class            | —                     |
| Export question bank            | Full           | Limited           | Full       | Department       | Own subjects              | —                     |
| Generate printable reports      | Full           | Full              | Full       | Department       | Own exams                 | Own result if enabled |
| **Academic Progression**        |                |                   |            |                  |                           |                       |
| Promote students                | Full           | Full              | Full       | View             | —                         | —                     |
| Review promotion list           | Full           | Full              | Full       | View             | —                         | —                     |
| Move student to next session    | Full           | Full              | Full       | —                | —                         | —                     |
| Graduate/archive students       | Full           | Full              | Full       | —                | —                         | —                     |
| **Subscription**                |                |                   |            |                  |                           |                       |
| View subscription               | Full           | Full              | View       | —                | —                         | —                     |
| Enter activation key            | —              | Full              | Authorized | —                | —                         | —                     |
| Renew access                    | Full           | Request/enter key | —          | —                | —                         | —                     |
| Suspend access                  | Full           | —                 | —          | —                | —                         | —                     |
| **Audit / Security**            |                |                   |            |                  |                           |                       |
| View audit log                  | Full           | Full              | Limited    | Department       | Own actions               | Own account           |
| Reset own password              | ✓              | ✓                 | ✓          | ✓                | ✓                         | ✓                     |
| Change own profile              | ✓              | ✓                 | ✓          | ✓                | ✓                         | ✓                     |
| Force password reset            | Full           | Full              | Full       | Limited          | —                         | —                     |
| Deactivate account              | Full           | Full              | Full       | —                | —                         | —                     |

¹ ADR-0038 amendment (2026-10-09): a Teacher may set registrations for the electives they teach in a class, and for every elective of a class they are form teacher of. "Assign teacher → class" is how School Admin or Moderator makes a teacher a class's form teacher. Compulsory subjects stay with School Admin and Moderator.

---

# The key permission rules behind the table

The table is the surface. These rules are what actually make the system safe and usable.

## 1. Teachers are scoped

A teacher does **not** get:

> "Access to all Mathematics questions."

They get:

> Mathematics → SS1A, SS1B, SS2A

based on their assignments.

So if Mr. Ade teaches Mathematics to SS1A and SS1B:

```text
Mr. Ade
├── Mathematics
│   ├── SS1A
│   └── SS1B
```

He cannot access SS3 questions simply because he is a Mathematics teacher.

---

# 2. HODs are department-scoped

An HOD should be able to manage the academic workflow for their department, but not the entire school.

For example:

**Science HOD**

Can review:

- Mathematics
- Physics
- Chemistry
- Biology

But not:

- Economics
- Accounting
- Literature

unless the school explicitly assigns them additional subjects/departments.

---

# 3. Moderators are operational, not academic authorities

This is an important distinction.

A Moderator can:

- Create users
- Edit users
- Assign classes
- Assign subjects
- Import students
- Manage school data
- Assist with exams

But they should **not automatically approve academic questions**.

That remains an HOD responsibility.

Similarly, a moderator shouldn't be able to alter a teacher's approved question just because they have user-management privileges.

---

# 4. School Admin is the ultimate school authority

Within the school, School Admin can override most school-level operations.

For example, if a teacher leaves:

**School Admin → deactivate teacher → reassign classes/subjects.**

If an HOD leaves:

**School Admin → remove HOD → assign new HOD.**

If a student changes class:

**School Admin → move student.**

However, we should still maintain an audit trail when privileged overrides occur.

---

# 5. Software Admin is above the school entirely

Software Admin can operate across all schools.

But this doesn't mean Software Admin should casually modify academic content.

I'd define two categories:

### Platform operations

Software Admin has unrestricted authority.

### School academic data

Software Admin has **emergency/support-level access**, with all such actions audited.

That is important for customer trust.

We don't want a platform operator casually editing a school's examination questions or scores.

---

# 6. Scores should be treated as highly sensitive

I would make result modification much stricter than result viewing.

For example:

Teacher:

> View results ✅

Teacher:

> Export results ✅

Teacher:

> Edit score ❌

Because objective CBT scores are automatically calculated.

If there is ever a need to correct a result, the action should be something like:

> **Result Adjustment / Attempt Invalidation**

with:

- Reason
- Person performing action
- Timestamp
- Previous value
- New state
- Audit record

We should **never silently overwrite historical marks**.

---

# 7. Questions behave differently depending on status

A teacher has full control over their own **draft** questions.

But once submitted:

```text
DRAFT
 ↓
SUBMITTED
 ↓
UNDER REVIEW
 ↓
APPROVED
```

editing becomes restricted.

An approved question that is currently attached to an exam should be effectively **immutable**.

If the teacher wants to modify it:

> Duplicate → create a new revision → submit for approval.

This protects exam integrity.

---

# 8. Exams also become progressively immutable

An exam in **Draft**:

> Everything can be changed.

Once **Active**:

> Questions, duration, scoring rules, etc. should be locked.

Once students have submitted attempts:

> The examination record should be effectively immutable.

You can close/reopen access, grant individual access, etc., but you shouldn't be freely changing the underlying assessment after students have taken it.

This is critical for auditability.

---

# 9. Student permissions should be intentionally tiny

The student should not be able to:

- Browse question bank
- View teacher information
- View other students
- View upcoming hidden exams
- Browse school data
- Modify exam content
- Reattempt an exam without authorization
- Change academic records

The student's system is essentially:

```text
LOGIN
 ↓
AVAILABLE ASSESSMENT
 ↓
START
 ↓
ANSWER
 ↓
SUBMIT
 ↓
RESULT
```

That's exactly what we want.

---

# 10. One permission I would add: "Invigilator capability"

I agree with your earlier point that we don't need an **Invigilator** as a permanent sixth/seventh school role.

Instead, we can have an **Exam Administration permission**.

For example, a School Admin could designate:

> Mr. Ade → Mathematics Teacher + Exam Operator

This means he can operate the Exam Control Center during a session.

Another teacher might have:

> Question Creator only

This avoids role explosion.

So later our permission system can distinguish:

**Role**

from

**Assigned capabilities**.

---

# 11. One more important concept: ownership

For exams, I'd distinguish:

**Created by**

**Owned by**

**Administered by**

For example:

```text
Exam:
Mathematics First Term Examination

Created by:
Mr. Ade

Subject:
Mathematics

Class:
SS2A

Administered by:
Mrs. Bola

Approved questions:
HOD Mathematics
```

That gives us flexibility when someone other than the teacher who created the exam needs to run the actual CBT session.

---

# 12. Recommended final role philosophy

I'd formalize the six roles like this:

### Software Admin

**Runs the platform.**

### School Admin

**Runs the school on the platform.**

### Moderator

**Runs school operations and user/data administration.**

### HOD

**Controls academic quality and departmental oversight.**

### Teacher

**Creates and administers assessments for assigned classes/subjects.**

### Student

**Takes assessments and accesses permitted results.**

That division is clean, intuitive, and matches how a real secondary-school environment operates.

---

# 13. The complete authority chain

The final model becomes:

```text
SOFTWARE ADMIN
     │
     │ Platform authority
     ▼
SCHOOL ADMIN
     │
     ├───────────────┐
     ▼               ▼
MODERATOR           HOD
     │               │
     │               │ Academic control
     │               ▼
     │            TEACHER
     │               │
     │               │ Assessment creation
     │               ▼
     │            STUDENT
     │
     └── User/data administration
```

And importantly, there is **not** a simple hierarchy where every higher role can casually modify everything below it. Each role has a domain of authority.

That will make the product much safer, cleaner, and easier to operate at scale.

**I would now treat this permission model as part of the core product specification.** The next major piece to lock down is the **complete end-to-end school lifecycle**, from "school receives activation key" → onboarding → users/classes/subjects → first question → HOD approval → first exam → batch administration → absent student makeup → results → end-of-session promotion. That will expose the remaining product rules and edge cases before we touch architecture.
