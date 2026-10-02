# Normalised Permission Table

**Generated from `packages/domain/src/authorization/permission-table.ts` — do not hand-edit this file.** Regenerate with `node scripts/generate-permission-table-doc.mjs` after `pnpm --filter @atlas/domain run build`.

This is B2's DoD item 1 deliverable: "the normalised permission table derived from `02`, resolving the undefined vocabulary in `A-03` into a closed set of scope predicates... reviewed and approved before guards are written." Every row below traces to one labelled row of `docs/02-roles-permissions.md`'s matrix.

**Legend:** `PLATFORM`/`SCHOOL`/`DEPARTMENT`/`ASSIGNED`/`OWNED`/`SELF`/`NONE` are the seven closed scope predicates (A-03). `—` = denied. `🔒 BREAK-GLASS` = Software Admin only, via the audited break-glass path (ADR-0012) — never an ordinary grant. `SYSTEM` = automatic, no human role invokes it directly. `⏸ DEFERRED` = the matrix documents this capability but its mechanism (e.g. ADR-0017's request/approval subsystem) is explicitly out of scope for now — denied, fail-closed, until that decision is acted on. `⚠️` marks a grant with an interpretive note (hover the row in the source file, or see the Notes column) — most commonly a "Limited" cell resolved to read-only pending the phase that builds the underlying resource.

## Identity & Sessions

| Action                                                                                                  | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD  | TEACHER | STUDENT | Awaiting |
| ------------------------------------------------------------------------------------------------------- | -------------- | ------------ | --------- | ---- | ------- | ------- | -------- |
| Read own resolved identity (GET /auth/me) — not an explicit 02 row.                                     | SELF           | SELF         | SELF      | SELF | SELF    | SELF    |          |
| Manage own session (logout/refresh) — not an explicit 02 row.                                           | SELF           | SELF         | SELF      | SELF | SELF    | SELF    |          |
| Read own effective permission set (GET /v1/me/permissions) — B2's own contract, not an explicit 02 row. | SELF           | SELF         | SELF      | SELF | SELF    | SELF    |          |
| Enrol, view or disable own second factor (TOTP) — B20, Software Admin only; not an explicit 02 row.     | SELF           | —            | —         | —    | —       | —       |          |

## Platform / School

| Action                                                                                      | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD           | TEACHER  | STUDENT | Awaiting |
| ------------------------------------------------------------------------------------------- | -------------- | ------------ | --------- | ------------- | -------- | ------- | -------- |
| Reset another Software Admin's second factor (lost device) — B20, reason required, audited. | PLATFORM       | —            | —         | —             | —        | —       |          |
| View all schools                                                                            | PLATFORM       | —            | —         | —             | —        | —       |          |
| Create school                                                                               | PLATFORM       | —            | —         | —             | —        | —       |          |
| Activate school                                                                             | PLATFORM       | —            | —         | —             | —        | —       |          |
| Suspend school                                                                              | PLATFORM       | —            | —         | —             | —        | —       |          |
| Renew subscription                                                                          | PLATFORM       | —            | —         | —             | —        | —       |          |
| Revoke school access                                                                        | PLATFORM       | —            | —         | —             | —        | —       |          |
| View subscription status                                                                    | PLATFORM       | SCHOOL ⚠️    | —         | —             | —        | —       |          |
| View school metrics                                                                         | PLATFORM ⚠️    | SCHOOL       | SCHOOL ⚠️ | DEPARTMENT    | ASSIGNED | SELF    |          |
| Platform audit/logs                                                                         | PLATFORM       | SCHOOL ⚠️    | SCHOOL ⚠️ | DEPARTMENT ⚠️ | SELF ⚠️  | —       |          |
| View orphan-media report (B4)                                                               | PLATFORM       | —            | —         | —             | —        | —       |          |

<details><summary>Notes</summary>

- **View subscription status / SCHOOL_ADMIN:** View own school.
- **View school metrics / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View school metrics / MODERATOR:** LIMITED (read-only placeholder): Exact "Limited" metrics subset finalized when B19 builds the dashboards.
- **Platform audit/logs / SCHOOL_ADMIN:** Own school.
- **Platform audit/logs / MODERATOR:** LIMITED (read-only placeholder): Unreachable via this endpoint — see audit.viewLog.
- **Platform audit/logs / HOD:** LIMITED (read-only placeholder): Unreachable via this endpoint — see audit.viewLog.
- **Platform audit/logs / TEACHER:** LIMITED (read-only placeholder): Unreachable via this endpoint — see audit.viewLog.

</details>

## School Configuration

| Action                                                       | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD       | TEACHER | STUDENT   | Awaiting |
| ------------------------------------------------------------ | -------------- | ------------ | --------- | --------- | ------- | --------- | -------- |
| View school profile                                          | PLATFORM       | SCHOOL       | SCHOOL    | SCHOOL    | SCHOOL  | SCHOOL ⚠️ |          |
| Edit school name/details                                     | PLATFORM ⚠️    | SCHOOL       | —         | —         | —       | —         |          |
| Upload/change logo                                           | PLATFORM ⚠️    | SCHOOL       | —         | —         | —       | —         |          |
| Set primary colour                                           | PLATFORM ⚠️    | SCHOOL ⚠️    | —         | —         | —       | —         |          |
| Manage school onboarding wizard progress                     | PLATFORM ⚠️    | SCHOOL ⚠️    | —         | —         | —       | —         |          |
| Manage departments (derived split: view)                     | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | SCHOOL ⚠️ | —       | —         |          |
| Manage departments (derived split: create/edit/delete)       | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | —         | —       | —         |          |
| Manage classes (derived split: view)                         | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | SCHOOL    | —       | —         |          |
| Manage classes (derived split: create/edit/delete)           | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | —         | —       | —         |          |
| Manage subjects (derived split: view)                        | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | SCHOOL    | —       | —         |          |
| Manage subjects (derived split: create/edit/delete)          | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | —         | —       | —         |          |
| Manage academic sessions (derived split: view)               | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | SCHOOL    | —       | —         |          |
| Manage academic sessions (derived split: create/edit/delete) | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | —         | —       | —         |          |
| Manage terms (derived split: view)                           | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | SCHOOL    | —       | —         |          |
| Manage terms (derived split: create/edit/delete)             | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | —         | —       | —         |          |
| View current academic context (school + session + term)      | —              | SELF         | SELF      | SELF      | SELF    | SELF      |          |
| View school settings (result policy, grading scale)          | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | —         | —       | —         |          |
| Manage school settings                                       | PLATFORM ⚠️    | SCHOOL       | —         | —         | —       | —         |          |

<details><summary>Notes</summary>

- **View school profile / STUDENT:** LIMITED (read-only placeholder): Field-limited view for students; exact fields finalized in B4.
- **Edit school name/details / SOFTWARE_ADMIN:** R1: school CRUD is a platform operation.
- **Upload/change logo / SOFTWARE_ADMIN:** R1.
- **Set primary colour / SOFTWARE_ADMIN:** R1.
- **Set primary colour / SCHOOL_ADMIN:** "Full / One-time" resolved as freely-editable, not a one-time lock (audit finding A-18) — School Admin may change the primary colour at any time; every change is audited (AuditService, action SCHOOL_BRANDING_CHANGED).
- **Manage school onboarding wizard progress / SOFTWARE_ADMIN:** R1.
- **Manage school onboarding wizard progress / SCHOOL_ADMIN:** F4: the ten-step onboarding wizard (03 §3, 05 §5.1-5.2) is School-Admin-only — never delegated to any other school role.
- **Manage departments (derived split: view) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Manage departments (derived split: view) / HOD:** Matrix cell is "View" — whole-school visibility, not department-limited.
- **Manage departments (derived split: create/edit/delete) / SOFTWARE_ADMIN:** R1: school structural/administrative setup, not academic content — flagged for review, not itself ADR-decided.
- **Manage classes (derived split: view) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Manage classes (derived split: create/edit/delete) / SOFTWARE_ADMIN:** R1 — see schoolConfig.department.manage.
- **Manage subjects (derived split: view) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Manage subjects (derived split: create/edit/delete) / SOFTWARE_ADMIN:** R1 — see schoolConfig.department.manage.
- **Manage academic sessions (derived split: view) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Manage academic sessions (derived split: create/edit/delete) / SOFTWARE_ADMIN:** R1 — see schoolConfig.department.manage.
- **Manage terms (derived split: view) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Manage terms (derived split: create/edit/delete) / SOFTWARE_ADMIN:** R1 — see schoolConfig.department.manage.
- **View school settings (result policy, grading scale) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Manage school settings / SOFTWARE_ADMIN:** R1 — see schoolConfig.department.manage.

</details>

## Media

| Action                                                  | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD    | TEACHER  | STUDENT | Awaiting |
| ------------------------------------------------------- | -------------- | ------------ | --------- | ------ | -------- | ------- | -------- |
| View branding (logo + primary colour + derived palette) | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | SCHOOL | SCHOOL   | —       |          |
| Upload media asset (question image/diagram/other)       | —              | SCHOOL       | SCHOOL    | SCHOOL | ASSIGNED | —       |          |
| Get signed access URL for a non-logo media asset        | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | SCHOOL | SCHOOL   | —       |          |

<details><summary>Notes</summary>

- **View branding (logo + primary colour + derived palette) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Upload media asset (question image/diagram/other) / SOFTWARE_ADMIN:** ADR-0012: content authoring denied to Software Admin.
- **Get signed access URL for a non-logo media asset / SOFTWARE_ADMIN:** Matches the established "Software Admin: read + audited break-glass" default for school content elsewhere in this table.
- **Get signed access URL for a non-logo media asset / STUDENT:** Students receive media via the attempt package (ADR-0021, B13), never this endpoint.

</details>

## User Management

| Action                    | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD        | TEACHER  | STUDENT | Awaiting                 |
| ------------------------- | -------------- | ------------ | --------- | ---------- | -------- | ------- | ------------------------ |
| View moderators           | PLATFORM ⚠️    | SCHOOL       | —         | —          | —        | —       |                          |
| Create Moderator          | 🔒 BREAK-GLASS | SCHOOL       | —         | —          | —        | —       |                          |
| Edit Moderator            | 🔒 BREAK-GLASS | SCHOOL       | —         | —          | —        | —       |                          |
| Remove Moderator          | 🔒 BREAK-GLASS | SCHOOL       | —         | —          | —        | —       |                          |
| View HODs                 | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Create HOD                | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Edit HOD                  | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Remove HOD                | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Reset HOD credentials     | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| View teachers             | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Create Teacher            | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Edit Teacher              | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Deactivate Teacher        | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Reset Teacher credentials | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| View students             | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| View own student profile  | PLATFORM ⚠️    | —            | —         | —          | —        | SELF ⚠️ |                          |
| Create Student            | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Edit Student              | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Deactivate Student        | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Reset Student credentials | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Import Teachers           | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Import Students           | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —        | —       |                          |
| Export Users              | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | ASSIGNED | —       | Export pipeline (B6/B18) |

<details><summary>Notes</summary>

- **View moderators / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Create Moderator / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Edit Moderator / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Remove Moderator / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **View HODs / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Create HOD / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Edit HOD / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Remove HOD / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Reset HOD credentials / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **View teachers / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Create Teacher / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Edit Teacher / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Deactivate Teacher / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Reset Teacher credentials / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **View students / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View own student profile / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View own student profile / STUDENT:** F14 gap-closure — GET /students/me (name, student ID, current class/department for the Profile screen, 04 §62). Distinct from users.student.view (the staff directory's broader, denied-to-STUDENT read) — this is narrowly the caller's own row only.
- **Create Student / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Edit Student / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Deactivate Student / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Reset Student credentials / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Import Teachers / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Import Students / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Export Users / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.

</details>

## Assignments

| Action                       | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD        | TEACHER | STUDENT | Awaiting |
| ---------------------------- | -------------- | ------------ | --------- | ---------- | ------- | ------- | -------- |
| Assign teacher → subject     | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | ⏸ DEFERRED | —       | —       |          |
| Assign teacher → class       | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | ⏸ DEFERRED | —       | —       |          |
| Assign HOD → department      | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —       | —       |          |
| Assign student → class       | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —       | —       |          |
| Move student between classes | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | ⏸ DEFERRED | —       | —       |          |
| View assignments             | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | SELF ⚠️ | SELF    |          |

<details><summary>Notes</summary>

- **Assign teacher → subject / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Assign teacher → subject / HOD:** R11: mechanism is ADR-0017's HOD request/approval subsystem, explicitly deferred (not part of the immediate implementation) — DENIED, fail-closed, until that phase lands.
- **Assign teacher → class / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Assign teacher → class / HOD:** R11: mechanism is ADR-0017's HOD request/approval subsystem, explicitly deferred (not part of the immediate implementation) — DENIED, fail-closed, until that phase lands.
- **Assign HOD → department / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Assign student → class / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Move student between classes / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Move student between classes / HOD:** R11: mechanism is ADR-0017's HOD request/approval subsystem, explicitly deferred (not part of the immediate implementation) — DENIED, fail-closed, until that phase lands.
- **View assignments / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View assignments / TEACHER:** Their own assignment records, not the ASSIGNED-scope resources those assignments grant access to.

</details>

## Question Bank

| Action                                      | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD        | TEACHER  | STUDENT | Awaiting |
| ------------------------------------------- | -------------- | ------------ | --------- | ---------- | -------- | ------- | -------- |
| View question bank                          | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | ASSIGNED | —       |          |
| Create question                             | —              | —            | —         | —          | ASSIGNED | —       |          |
| Edit own draft question                     | —              | —            | —         | —          | OWNED    | —       |          |
| Delete own draft question                   | —              | —            | —         | —          | OWNED    | —       |          |
| Submit question for review                  | —              | —            | —         | —          | OWNED    | —       |          |
| Review submitted questions                  | —              | SCHOOL       | —         | DEPARTMENT | —        | —       |          |
| Comment on question (derived split: view)   | —              | SCHOOL       | —         | DEPARTMENT | OWNED ⚠️ | —       |          |
| Comment on question (derived split: create) | —              | —            | —         | DEPARTMENT | OWNED ⚠️ | —       |          |
| Approve question                            | —              | —            | —         | DEPARTMENT | —        | —       |          |
| Reject question                             | —              | —            | —         | DEPARTMENT | —        | —       |          |
| Request changes                             | —              | —            | —         | DEPARTMENT | —        | —       |          |
| Archive question                            | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED ⚠️ | —       |          |
| Import questions                            | 🔒 BREAK-GLASS | SCHOOL ⚠️    | SCHOOL    | DEPARTMENT | ASSIGNED | —       |          |
| Export questions                            | PLATFORM ⚠️    | SCHOOL ⚠️    | SCHOOL    | DEPARTMENT | ASSIGNED | —       |          |

<details><summary>Notes</summary>

- **View question bank / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Comment on question (derived split: view) / TEACHER:** Comments on their own submitted question.
- **Comment on question (derived split: create) / TEACHER:** "Respond to feedback" — replies on their own question's review thread, not an initiating review comment.
- **Archive question / SOFTWARE_ADMIN:** R4: named explicitly in ADR-0012 as a break-glass example.
- **Archive question / TEACHER:** "Own/assigned" — an author may archive their own question.
- **Import questions / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Import questions / SCHOOL_ADMIN:** LIMITED (read-only placeholder): B7/B8 — School Admin's import boundary is not yet finalized (this is a CREATE-shaped row; "Limited" is recorded here as a placeholder pending that phase, not a working read-only grant).
- **Export questions / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Export questions / SCHOOL_ADMIN:** LIMITED (read-only placeholder): B8.

</details>

## Question Lifecycle

| Action                                    | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD        | TEACHER     | STUDENT | Awaiting |
| ----------------------------------------- | -------------- | ------------ | --------- | ---------- | ----------- | ------- | -------- |
| Create Draft                              | —              | —            | —         | —          | ASSIGNED ⚠️ | —       |          |
| Submit                                    | —              | —            | —         | —          | OWNED ⚠️    | —       |          |
| Under Review (view)                       | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED       | —       |          |
| Approved (view)                           | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED       | —       |          |
| Rejected (derived split: view)            | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED       | —       |          |
| Rejected (derived split: edit & resubmit) | —              | —            | —         | —          | OWNED ⚠️    | —       |          |
| Archived (view)                           | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED       | —       |          |

<details><summary>Notes</summary>

- **Create Draft / TEACHER:** Duplicate of "Create question" — gated by subject/class assignment before the question exists to be OWNED.
- **Submit / TEACHER:** Duplicate of "Submit question for review".
- **Under Review (view) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Approved (view) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Rejected (derived split: view) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Rejected (derived split: edit & resubmit) / TEACHER:** Only while question.status = REJECTED — resource-state gate enforced by QuestionRevisionService.createRevision() (B8), reachable for real once B9's review endpoints actually produce a REJECTED revision.
- **Archived (view) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.

</details>

## Exam Management

| Action                          | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD        | TEACHER  | STUDENT | Awaiting |
| ------------------------------- | -------------- | ------------ | --------- | ---------- | -------- | ------- | -------- |
| View all exams                  | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | ASSIGNED | SELF ⚠️ |          |
| Create exam                     | —              | —            | —         | —          | ASSIGNED | —       |          |
| Edit draft exam                 | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Delete draft exam               | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Cancel exam                     | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Add questions to exam           | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Use approved questions          | —              | SCHOOL       | SCHOOL    | DEPARTMENT | ASSIGNED | —       |          |
| Schedule/configure availability | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Configure duration              | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Configure randomization         | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Configure attempts              | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Publish/activate exam           | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Pause exam                      | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Close new attempts              | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Reopen exam                     | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Manage exam administrators      | —              | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Archive exam                    | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |

<details><summary>Notes</summary>

- **View all exams / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View all exams / STUDENT:** "Available only" — ADR-0006's eligibility predicate; B12 wires the actual filter.
- **Create exam / SCHOOL_ADMIN:** R12/C-07: exam authoring is a Teacher capability; School Admin holds administration rights on existing exams instead.
- **Create exam / MODERATOR:** R12/C-07.
- **Create exam / HOD:** R12/C-07.
- **Archive exam / SOFTWARE_ADMIN:** R4: matrix's literal "Full" read as break-glass per this file's header — consistent with "archive question" being explicitly named break-glass.

</details>

## Exam Administration

| Action                           | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD        | TEACHER  | STUDENT | Awaiting |
| -------------------------------- | -------------- | ------------ | --------- | ---------- | -------- | ------- | -------- |
| Exam Control Center              | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| View registered students         | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | ASSIGNED | —       |          |
| View live attempts               | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| See who has started              | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| See who has completed            | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Manually allow student           | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Grant makeup access              | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Mark/confirm absence             | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Authorize exceptional reattempt  | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| End individual attempt           | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Grant extra time (accommodation) | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |
| Invalidate attempt               | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED    | —       |          |

<details><summary>Notes</summary>

- **Exam Control Center / SOFTWARE_ADMIN:** R4: operating a school's live Exam Control Center is a school-academic write surface; SA reads (viewing live status) are separately permitted+audited — see the view-* rows below.
- **View registered students / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View live attempts / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **See who has started / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **See who has completed / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Manually allow student / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Grant makeup access / SOFTWARE_ADMIN:** R4: named explicitly in ADR-0012 as a break-glass example.
- **Mark/confirm absence / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Authorize exceptional reattempt / SOFTWARE_ADMIN:** R4: exceptional academic intervention requires break-glass.
- **End individual attempt / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Grant extra time (accommodation) / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Invalidate attempt / SOFTWARE_ADMIN:** R4: named explicitly in ADR-0012 as a break-glass example.

</details>

## Student CBT

| Action                     | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD    | TEACHER | STUDENT | Awaiting |
| -------------------------- | -------------- | ------------ | --------- | ------ | ------- | ------- | -------- |
| View active assessment     | —              | —            | —         | —      | —       | SELF    |          |
| Start exam                 | —              | —            | —         | —      | —       | SELF    |          |
| Answer questions           | —              | —            | —         | —      | —       | SELF    |          |
| Navigate questions         | —              | —            | —         | —      | —       | SELF    |          |
| Submit exam                | —              | —            | —         | —      | —       | SELF    |          |
| Auto-submit on timeout     | SYSTEM         | SYSTEM       | SYSTEM    | SYSTEM | SYSTEM  | SYSTEM  |          |
| Resume interrupted attempt | —              | —            | —         | —      | —       | SELF    |          |
| View previous results      | —              | —            | —         | —      | —       | SELF ⚠️ |          |

<details><summary>Notes</summary>

- **View previous results / STUDENT:** "Configurable" — the school-level axis is Exam.resultDetailVisibility (ADR-0010), seeded from School.resultDetailVisibility; B15 wires it into GET /v1/student/results/:id.

</details>

## Results

| Action                                   | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR  | HOD        | TEACHER     | STUDENT | Awaiting                            |
| ---------------------------------------- | -------------- | ------------ | ---------- | ---------- | ----------- | ------- | ----------------------------------- |
| Automatic marking                        | SYSTEM         | SYSTEM       | SYSTEM     | SYSTEM     | SYSTEM      | —       |                                     |
| View exam results                        | PLATFORM ⚠️    | SCHOOL       | SCHOOL     | DEPARTMENT | OWNED       | SELF ⚠️ |                                     |
| View individual student result           | PLATFORM ⚠️    | SCHOOL       | SCHOOL     | DEPARTMENT | ASSIGNED    | SELF    |                                     |
| View class performance                   | PLATFORM ⚠️    | SCHOOL       | SCHOOL     | DEPARTMENT | ASSIGNED    | —       | Result (B16/B17 analytics)          |
| View subject performance                 | PLATFORM ⚠️    | SCHOOL       | DEPARTMENT | DEPARTMENT | ASSIGNED ⚠️ | —       | Result (B16/B17 analytics)          |
| View question performance                | PLATFORM ⚠️    | SCHOOL       | DEPARTMENT | DEPARTMENT | OWNED ⚠️    | —       | Result/Question analytics (B16/B17) |
| Export CSV                               | PLATFORM ⚠️    | SCHOOL       | SCHOOL     | DEPARTMENT | OWNED       | —       |                                     |
| Publish results                          | —              | SCHOOL       | SCHOOL     | DEPARTMENT | OWNED       | —       |                                     |
| Unpublish results                        | —              | SCHOOL       | SCHOOL     | DEPARTMENT | OWNED       | —       |                                     |
| Withhold or release an individual result | —              | SCHOOL       | SCHOOL     | DEPARTMENT | OWNED       | —       |                                     |
| Create a result adjustment               | —              | SCHOOL       | SCHOOL     | DEPARTMENT | —           | —       |                                     |
| Manually override a result score         | —              | SCHOOL       | —          | —          | —           | —       |                                     |

<details><summary>Notes</summary>

- **View exam results / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View exam results / STUDENT:** "Own published results" — gated by ResultPublication (ADR-0010); B15 wires the publication-state check via @atlas/domain's shared visibility helper.
- **View individual student result / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View class performance / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View subject performance / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View subject performance / TEACHER:** "Own subjects".
- **View question performance / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View question performance / TEACHER:** "Own exams".
- **Export CSV / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.

</details>

## Analytics

| Action                       | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR     | HOD        | TEACHER  | STUDENT | Awaiting                              |
| ---------------------------- | -------------- | ------------ | ------------- | ---------- | -------- | ------- | ------------------------------------- |
| Platform analytics           | PLATFORM       | —            | —             | —          | —        | —       | Platform metrics (B3)                 |
| School-wide analytics        | PLATFORM ⚠️    | SCHOOL       | SCHOOL        | —          | —        | —       | B16/B17 analytics                     |
| Department analytics         | PLATFORM ⚠️    | SCHOOL       | DEPARTMENT ⚠️ | DEPARTMENT | —        | —       | B16/B17 analytics                     |
| Class analytics              | PLATFORM ⚠️    | SCHOOL       | SCHOOL        | DEPARTMENT | ASSIGNED | —       | B16/B17 analytics                     |
| Student performance history  | PLATFORM ⚠️    | SCHOOL       | SCHOOL        | DEPARTMENT | ASSIGNED | SELF    | B16/B17 analytics                     |
| Question difficulty analysis | PLATFORM ⚠️    | SCHOOL       | DEPARTMENT    | DEPARTMENT | OWNED    | —       | Question/Result analytics (B16/B17)   |
| Exam completion statistics   | PLATFORM ⚠️    | SCHOOL       | SCHOOL        | DEPARTMENT | OWNED    | —       | ExamParticipation analytics (B16/B17) |

<details><summary>Notes</summary>

- **School-wide analytics / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Department analytics / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Department analytics / MODERATOR:** LIMITED (read-only placeholder): Exact "Limited" department-analytics subset for Moderator finalized in B19.
- **Class analytics / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Student performance history / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Question difficulty analysis / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Exam completion statistics / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.

</details>

## Reporting / Export

| Action                                | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD        | TEACHER     | STUDENT | Awaiting                                                                                          |
| ------------------------------------- | -------------- | ------------ | --------- | ---------- | ----------- | ------- | ------------------------------------------------------------------------------------------------- |
| Role-aware global school search (B18) | —              | SCHOOL       | —         | DEPARTMENT | ASSIGNED    | —       |                                                                                                   |
| Export school data                    | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | ASSIGNED    | —       | B18 reporting                                                                                     |
| Export exam results                   | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED       | —       | B18 reporting                                                                                     |
| Export student list                   | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | ASSIGNED    | —       | B18 reporting                                                                                     |
| Export question bank                  | PLATFORM ⚠️    | SCHOOL ⚠️    | SCHOOL    | DEPARTMENT | ASSIGNED ⚠️ | —       | Question (B8), B18 reporting                                                                      |
| Generate printable reports            | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | OWNED       | SELF ⚠️ | ADR-0030 defers server-rendered PDF reporting to a later phase; B18 gains the rendering pipeline. |

<details><summary>Notes</summary>

- **Export school data / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Export exam results / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Export student list / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Export question bank / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Export question bank / SCHOOL_ADMIN:** LIMITED (read-only placeholder): B8.
- **Export question bank / TEACHER:** "Own subjects".
- **Generate printable reports / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Generate printable reports / STUDENT:** "if enabled" — school-setting gated, same family as studentCbt.viewPreviousResults.

</details>

## Academic Progression

| Action                                    | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD        | TEACHER | STUDENT | Awaiting                 |
| ----------------------------------------- | -------------- | ------------ | --------- | ---------- | ------- | ------- | ------------------------ |
| Promote students (derived split: view)    | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | —       | —       | Promotion workflow (B19) |
| Promote students (derived split: execute) | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —       | —       | Promotion workflow (B19) |
| Review promotion list                     | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT | —       | —       | Promotion workflow (B19) |
| Move student to next session              | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —       | —       | Promotion workflow (B19) |
| Graduate/archive students                 | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —          | —       | —       | Promotion workflow (B19) |

<details><summary>Notes</summary>

- **Promote students (derived split: view) / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Promote students (derived split: execute) / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Review promotion list / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **Move student to next session / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.
- **Graduate/archive students / SOFTWARE_ADMIN:** R4: ADR-0012 school-academic-write category, extended from its named examples — see this file's header.

</details>

## Subscription

| Action               | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR  | HOD | TEACHER | STUDENT | Awaiting                          |
| -------------------- | -------------- | ------------ | ---------- | --- | ------- | ------- | --------------------------------- |
| View subscription    | PLATFORM       | SCHOOL       | SCHOOL     | —   | —       | —       | Subscription (B3)                 |
| Enter activation key | —              | SCHOOL       | ⏸ DEFERRED | —   | —       | —       | ActivationGrant (B3)              |
| Renew access         | PLATFORM       | SCHOOL ⚠️    | —          | —   | —       | —       | Subscription/ActivationGrant (B3) |
| Suspend access       | PLATFORM       | —            | —          | —   | —       | —       | Subscription (B3)                 |

<details><summary>Notes</summary>

- **Enter activation key / MODERATOR:** "Authorized" — Moderator may redeem only when explicitly delegated by School Admin; the delegation mechanism is unspecified anywhere and left to B3's activation-flow design.
- **Renew access / SCHOOL_ADMIN:** "Request/enter key" — School Admin may request renewal or redeem a key directly; B3 differentiates the two flows.

</details>

## Audit / Security

| Action                                                       | SOFTWARE_ADMIN | SCHOOL_ADMIN | MODERATOR | HOD           | TEACHER | STUDENT | Awaiting                                                                             |
| ------------------------------------------------------------ | -------------- | ------------ | --------- | ------------- | ------- | ------- | ------------------------------------------------------------------------------------ |
| View audit log                                               | PLATFORM ⚠️    | SCHOOL       | SCHOOL    | DEPARTMENT    | SELF ⚠️ | SELF ⚠️ |                                                                                      |
| View own notifications — not a literal 02 matrix row.        | SELF           | SELF         | SELF      | SELF          | SELF    | SELF    |                                                                                      |
| Mark own notification(s) read — not a literal 02 matrix row. | SELF           | SELF         | SELF      | SELF          | SELF    | SELF    |                                                                                      |
| Reset own password                                           | SELF           | SELF         | SELF      | SELF          | SELF    | SELF    |                                                                                      |
| Change own profile                                           | SELF           | SELF         | SELF      | SELF          | SELF    | SELF    | No profile-edit endpoint yet (future phase); identity read already exists (auth/me). |
| Force password reset                                         | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | DEPARTMENT ⚠️ | —       | —       |                                                                                      |
| Deactivate account                                           | 🔒 BREAK-GLASS | SCHOOL       | SCHOOL    | —             | —       | —       |                                                                                      |

<details><summary>Notes</summary>

- **View audit log / SOFTWARE_ADMIN:** R3: ADR-0012 "permitted, audited" — read-audit emission deferred, see B10's Deferred items.
- **View audit log / TEACHER:** "Own actions".
- **View audit log / STUDENT:** "Own account".
- **Force password reset / SOFTWARE_ADMIN:** R4: named explicitly in ADR-0012 as a break-glass example.
- **Force password reset / HOD:** LIMITED (read-only placeholder): "Limited" — HOD has no real write access to this action (B6 finalized: consistent with ADR-0017). Recorded as read-only per R5 — the row is EXECUTE-shaped, but no controller route grants HOD real write access.
- **Deactivate account / SOFTWARE_ADMIN:** R4: named explicitly in ADR-0012 as a break-glass example.

</details>
