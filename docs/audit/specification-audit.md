# Specification Audit — Project Atlas CBT Platform

**Audit date:** 2026-08-24
**Audit scope:** `docs/01` … `docs/09` (nine approved specifications), plus `PROJECT.md`, `CLAUDE.md`, `AGENTS.md`
**Repository state at audit time:** documentation only. No application source, package manifest, migrations, or infrastructure code exists. Implementation has not started.

---

## 0. Purpose and Method

This audit evaluates the nine approved specification documents **against one another**, not against a preferred implementation. Its objectives are:

1. Establish where the specifications agree, so those areas can be implemented with confidence.
2. Surface every place where two documents describe different behaviour.
3. Surface every requirement that is not precise enough to implement without a divergent guess.
4. Identify behaviour the product and architecture lifecycle demand but the documentation does not adequately cover.
5. Identify architectural, data-model, and exam-engine risks before code exists.

### Method

Each document was read in full. Findings were produced by cross-comparing:

- the **narrative product documents** (`01`, `02`, `03`, `04`), which in places evolve their own position across their own length;
- the **normative behaviour document** (`05`);
- the **canonical model documents** (`06`, `07`);
- the **architecture and stack documents** (`08`, `09`).

### Document authority ranking used by this audit

Where documents disagree, this audit treats later, more formal, explicitly "canonical" statements as stronger evidence of current intent. This mirrors the source-of-truth hierarchy in `AGENTS.md` §2.

| Rank | Document                            | Rationale                                                                      |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------ |
| 1    | `07-erd-state-transitions.md`       | Self-declared "final product/data-model contract"; declares the model "locked" |
| 2    | `06-domain-data-model.md`           | Canonical domain model                                                         |
| 3    | `05-functional-requirements.md`     | Normative behaviour layer                                                      |
| 4    | `03-school-lifecycle.md`            | Canonical operational model; states rules as "non-negotiable"                  |
| 5    | `08` / `09`                         | Architecture and stack; explicitly must not redefine product                   |
| 6    | `02` / `04`                         | Permission surface and screen structure                                        |
| 7    | `01-product-vision.md` (first half) | Exploratory, and **explicitly superseded by its own second half**              |

**This ranking is an audit convention for framing recommendations. It is not a product decision and overrides nothing.** No specification has been modified by this audit.

### Severity legend

| Severity    | Meaning                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BLOCKER** | The affected implementation phase cannot start without a decision; divergent guesses produce incompatible schemas or incorrect examination behaviour |
| **HIGH**    | Will cause rework, integrity defects, or an incorrect security posture if guessed wrongly                                                            |
| **MEDIUM**  | Divergence is recoverable but will cost redesign or migration                                                                                        |
| **LOW**     | Editorial or easily corrected later                                                                                                                  |

### Finding ID scheme

| Prefix | Category            |
| ------ | ------------------- |
| `C-nn` | Contradiction       |
| `A-nn` | Ambiguity           |
| `M-nn` | Missing requirement |
| `R-nn` | Architectural risk  |
| `D-nn` | Data-model risk     |
| `X-nn` | Exam-engine risk    |

Findings requiring a product or architecture decision carry a reserved **ADR ID** (`ADR-0001` …). ADRs live in `docs/decisions/`. A reserved ADR ID means: _this decision is open, the ADR file has not yet been written, and the audit's recommendation is a recommendation only._

---

## 1. Executive Summary

The specification set is unusually strong for a pre-implementation product. The domain model, examination transaction, and integrity invariants in `06` and `07` are coherent, deliberate, and implementable. The product identity — "CBT platform, not an LMS" — is held consistently across all nine documents, and the hardest parts of the product (attempt snapshots, individual timers, absence-versus-score separation, makeup-as-new-attempt, result provenance) are already correctly reasoned.

The audit found:

| Category                |  Count | BLOCKER |   HIGH |
| ----------------------- | -----: | ------: | -----: |
| B. Contradictions       |     14 |       3 |      6 |
| C. Ambiguities          |     18 |       4 |      7 |
| D. Missing requirements |     17 |       3 |      7 |
| E. Architectural risks  |     12 |       1 |      6 |
| F. Data-model risks     |     13 |       3 |      7 |
| G. Exam-engine risks    |     14 |       4 |      7 |
| **Total**               | **88** |  **18** | **40** |

### The five findings that most threaten delivery

1. **`C-04` / `M-01` — `Subject` has no department, and `Question` has no class or level.** HOD review scope (department → subjects) and teacher question scope (subject + class) are both required in prose across `01`, `02`, `03`, and `05`, but **cannot be computed** from the canonical model in `06`/`07`. This blocks the authorization engine, the question bank, and the entire HOD workflow. **BLOCKER — ADR-0001.**
2. **`C-09` — Question pools.** `05 §21` places per-attempt random draw from a question pool in production scope; `06`/`07` model only a fixed `ExamQuestion` binding. These imply materially different exam engines, snapshot construction, and question analytics. **BLOCKER — ADR-0002.**
3. **`X-01` / `X-02` — Auto-submission has no owner, and the post-expiry cutoff policy is undefined.** `08 §11.4` refers to "the defined cutoff policy"; no document defines it. Nothing specifies what transitions an abandoned `IN_PROGRESS` attempt into `AUTO_SUBMITTED` when the student's browser never returns. The exam engine cannot be built correctly without both. **BLOCKER — ADR-0003, ADR-0004.**
4. **`X-05` — The attempt snapshot carries the answer key toward the client.** `07 §9.2` includes `correct_answer_snapshot` in `AttemptQuestionSnapshot`; `08 §11.1` sends "the attempt package" to the client; `09 §8` persists that package in IndexedDB. No document states that the correct answer must be stripped from the client payload. Implemented literally, a student can read the answer key out of browser storage during the exam. **BLOCKER — no ADR required; this is a defect to prevent, recorded as a mandatory contract rule.**
5. **`A-01` — Login has no tenant resolution.** Students authenticate with a school-issued Student ID that is unique only within a school. No document specifies how a login request resolves to a school (subdomain, school code field, invitation link). This blocks B1/F1, the first substantive phase. **BLOCKER — ADR-0005.**

### What is safe to build now

The following are consistent across documents and need no open decision: the tenancy boundary, school and subscription lifecycle, academic structure entities, identity/membership/role separation, question revision immutability, the exam state machine, the exam-session batch model, individual attempt timing, absence-is-not-a-score, makeup-as-new-attempt, result provenance, and the audit-first posture.

---

## 2. Decision Register

> **Status as of 2026-08-24: all 33 decisions are RESOLVED.** Every ADR is written and accepted in [`../decisions/`](../decisions/) — see that directory's [README](../decisions/README.md) for the outcomes grouped by gate.
>
> Two carry conditions: ADR-0028's retention schedule is provisional pending legal review at B20, and ADR-0032's region is to be validated by measurement at B21.
>
> The table below is retained as the **finding → ADR mapping**. It remains the way to trace any audit finding to the decision that settled it. The "Blocks" column records what each decision was gating before it was made.

The recommendations recorded throughout this audit were the audit's proposals. Where a decision required product, commercial, or domain judgement, it was referred to the project owner rather than settled by the audit — per `AGENTS.md` §3 and §14. Decisions taken by the project owner are marked as such in their ADR's `Deciders` field.

| ADR      | Decision required                                                                                                | Findings         | Severity | Blocks     |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ---------------- | -------- | ---------- |
| ADR-0001 | Does `Subject` belong to a `Department`, and does a question carry a class or level?                             | C-04, M-01, D-02 | BLOCKER  | B5, B8, B9 |
| ADR-0002 | Are question pools (per-attempt draw) in the initial release, or is question selection fixed at build time?      | C-09, X-06       | BLOCKER  | B11, B13   |
| ADR-0003 | Post-expiry cutoff policy and grace window for late answer writes                                                | X-02, A-06       | BLOCKER  | B13        |
| ADR-0004 | Auto-submission mechanism and ownership (sweeper job, on-demand, or both)                                        | X-01             | BLOCKER  | B14        |
| ADR-0005 | Tenant resolution at login, and uniqueness scope of `login_identifier`                                           | A-01, R-02       | BLOCKER  | B1, F1     |
| ADR-0006 | Is class eligibility sufficient to start an attempt, or is explicit per-student session authorization mandatory? | A-04, C-08       | BLOCKER  | B12, F12   |
| ADR-0007 | Answer persistence model: last-write-wins row versus append-only answer events                                   | A-07, D-06, X-04 | HIGH     | B13        |
| ADR-0008 | Snapshot storage shape: per-question rows versus one JSONB document per attempt                                  | R-05, D-05       | HIGH     | B13        |
| ADR-0009 | Is `PAUSED` a real exam state, or is "Pause" an alias for close-new-attempts?                                    | C-03             | HIGH     | B12        |
| ADR-0010 | Result publication granularity, and reconciliation of `Result.state` with `ResultPublication`                    | C-05, A-09       | HIGH     | B15        |
| ADR-0011 | Student subject registration: are electives modelled, or is class membership sufficient?                         | M-02             | BLOCKER  | B6, B11    |
| ADR-0012 | Software Admin authority over school academic content: full or break-glass                                       | C-06             | HIGH     | B2, B3     |
| ADR-0013 | May one exam serve multiple classes or arms?                                                                     | M-03, D-03       | HIGH     | B11        |
| ADR-0014 | Exceptional reattempt: authorization entity and interaction with `attempt_limit`                                 | M-04, C-11       | HIGH     | B16        |
| ADR-0015 | Subscription expiry during an active attempt — exact permitted operations                                        | A-10, C-13       | HIGH     | B3, B13    |
| ADR-0016 | Authoritative access gate: `School.status` versus `Subscription.status`                                          | C-13, D-04       | HIGH     | B3         |
| ADR-0017 | HOD request/approval workflow — does it exist, or are those matrix cells withdrawn?                              | C-10, M-05       | MEDIUM   | B6, B9     |
| ADR-0018 | Grading scale entity, ownership, and versioning                                                                  | M-06             | HIGH     | B15        |
| ADR-0019 | Transactional messaging channel for invitations, resets, activation, and expiry warnings                         | M-07             | BLOCKER  | B1, B3     |
| ADR-0020 | Integrity signal model (`AttemptEvent`) and attempt liveness/heartbeat                                           | M-08, M-09, X-09 | HIGH     | B13, B12   |
| ADR-0021 | Offline delivery of private question media versus short-lived signed URLs                                        | R-06, X-10       | HIGH     | B4, B13    |
| ADR-0022 | Cross-origin session strategy (Vercel web ↔ AWS API): cookies versus bearer tokens, CSRF posture                 | R-02             | BLOCKER  | B0, B1     |
| ADR-0023 | PostgreSQL Row-Level Security as defence in depth alongside application scoping                                  | R-01             | HIGH     | B0, B2     |
| ADR-0024 | Participation roll-up rule across multiple sessions of one exam                                                  | A-05, D-07       | HIGH     | B16        |
| ADR-0025 | Effect of attempt invalidation on an existing `Result` under the 1:1 constraint                                  | A-11, D-08       | HIGH     | B15, B16   |
| ADR-0026 | Session rollover mechanics: what is copied, recreated, or decided                                                | M-10, M-11       | MEDIUM   | B19        |
| ADR-0027 | Timezone policy and canonical storage/display of academic timestamps                                             | M-12             | HIGH     | B0         |
| ADR-0028 | Data protection posture (NDPR), retention schedule, and handling of minors' PII                                  | M-13, M-14       | MEDIUM   | B20        |
| ADR-0029 | Exam sections in the initial release: schema-only or user-facing                                                 | A-12             | MEDIUM   | B11        |
| ADR-0030 | Printable and PDF reporting: browser print versus server-rendered PDF                                            | A-13             | LOW      | B18        |
| ADR-0031 | Technology version baseline re-validation (`09` was written against August 2026 releases)                        | R-11             | HIGH     | B0         |
| ADR-0032 | AWS region selection and latency posture for Nigerian school networks                                            | R-08, R-09       | HIGH     | B0, B21    |
| ADR-0033 | Idempotency key format and canonical API error contract                                                          | M-16             | HIGH     | B0, B13    |

---

## 3. Section A — Consistencies

Recorded because they define the load-bearing commitments implementation must not erode, and because they mark the parts of the roadmap that can proceed without waiting on an open decision.

### A-C1. Product identity: CBT, not LMS

**Documents:** `01` (opening, §53), `03 §82 Rule 12`, `04 §52`, `05 §69`, `CLAUDE.md`, `AGENTS.md §3`

Every document independently rejects LMS scope — courses, learning materials, homework, attendance-as-a-feature, messaging, social surfaces. `01 §53` enumerates the deferred set; `CLAUDE.md` and `AGENTS.md` restate it as a standing constraint. **No contradiction anywhere in the set.**

### A-C2. Six roles, and no more

**Documents:** `01 §2`, `02` (matrix, §12), `03 §85`, `06 §8`, `07 §5.3`, `08 §10`

`SOFTWARE_ADMIN`, `SCHOOL_ADMIN`, `MODERATOR`, `HOD`, `TEACHER`, `STUDENT` appear identically in all six. Both `01 §12` (second half) and `02 §10` independently consider and reject a permanent Invigilator role, proposing capability assignment instead. Consistent — though the _implementation_ of that capability is unspecified (see `M-15`).

### A-C3. Role alone is insufficient; scope is part of authorization

**Documents:** `01 §33`, `02` (preamble, §1, §2), `05 §1.2`, `07 §41`, `08 §10`

All express one formula: access = role **+** school **+** academic scope **+** ownership **+** resource state. `08 §10` gives the canonical expansion; `07 §41` binds it to concrete entities (`TeacherAssignment`, `HODAssignment`, `RoleAssignment`). Directly implementable.

### A-C4. School is the tenant, and isolation is absolute

**Documents:** `01` (opening), `05 §1.1`, `06 §3`, `07 §3.1`, `07 §42 Invariant 1`, `08 §3`, `08 §8`, `AGENTS.md §6`

Identical framing throughout: every school-owned record is traceable to exactly one school; cross-school references are prohibited; Software Admin is the only cross-tenant actor. `08 §8` correctly extends the boundary to background workers, cache keys, object-storage paths, and exports — a level of rigour worth preserving verbatim into implementation.

### A-C5. Identity is separated from membership, role, and academic profile

**Documents:** `01 §34`, `06 §6`–`§12`, `07 §5.1`–`§5.5`

`User` → `SchoolMembership` → `RoleAssignment` → (`StudentProfile` | `TeacherProfile`). `06 §9` and `07 §5.3` both explicitly support multi-role users (Teacher + HOD). `06 §12` correctly declines to create separate person tables for HOD, Moderator, and School Admin.

### A-C6. Academic placement is historical, not a mutable field

**Documents:** `01 §35`–`§36`, `03 §8`, `03 §59`, `05 §1.3`, `06 §17`, `06 §20`, `06 §71`, `07 §6.7`, `07 §35`

All agree: `StudentEnrollment` per session rather than `student.class_id`; `ClassGroup` is session-scoped, so `SS2A` in 2026/2027 is a different entity from `SS2A` in 2027/2028; historical exam context is never rewritten when a student moves. `06 §71` argues the point explicitly. One of the strongest and most consistently held decisions in the set.

### A-C7. Question revisions are immutable once approved

**Documents:** `01 §15`, `02 §7`, `03 §21`–`§24`, `05 §17`, `06 §26`, `06 §30`, `07 §7.2`, `07 §37`

Approval attaches to the **revision**, not the logical question; substantive edits create a new revision; review history is never overwritten; an exam binds one specific approved revision. `06 §35` and `07 §37` work the same example (Revision 2 in the old exam, Revision 4 in the new one). No divergence.

### A-C8. Exams may contain only approved question revisions

**Documents:** `03 §27`, `05 §20`, `05 §23`, `06 §34`, `07 §8.3`, `07 §42 Invariant 5`

Uniform and stated as non-bypassable. `03 §27` explicitly forbids allowing a teacher to bypass it for convenience.

### A-C9. No global exam clock; availability is operator-controlled

**Documents:** `01 §1`–`§6` (second half), `03 §29`, `03 §82 Rules 1–3`, `05 §25`, `05 §27`, `06 §37`–`§42`, `07 §21`, `CLAUDE.md` principle 7

The activation model (`READY` → operator opens → students may start) is consistent across every document written after `01`'s mid-document correction. `01`'s own first half is superseded by its own second half — see `C-01`.

### A-C10. Each attempt has an independent, server-authoritative timer

**Documents:** `01 §2` (second half), `03 §32`, `03 §36`, `05 §33`, `05 §36`, `06 §48`, `07 §9.1`, `07 §42 Invariant 7`, `08 §11.4`, `09 §7`

Consistent and emphatic: the timer starts at `started_at`, `expires_at` is derived server-side, disconnecting never grants extra time, and the client displays but never defines the deadline. `09 §7` restates it as "the PWA is not the authority."

### A-C11. One exam, many administration sessions

**Documents:** `01 §3`, `01 §11` (second half), `03 §38`–`§39`, `05 §70`, `06 §40`, `06 §73`, `06 §79`, `07 §8.4`, `07 §32`

All documents reject artificial "Batch 1 / Batch 2" duplicate exams and converge on `Exam` → `ExamSession`. `06 §79` states the rejection of a `BatchExam` entity explicitly.

### A-C12. Absence is a participation status, not an attempt and not a zero

**Documents:** `01 §8` (second half), `03 §42`, `03 §82 Rule 5`, `05 §39`, `05 §54`, `06 §47`, `06 §61`, `07 §9.5`, `07 §42 Invariant 9`

Consistent, including the downstream requirement in `05 §54` that exports preserve `ABSENT` rather than converting it to `0`.

### A-C13. Makeup is a new attempt against the same exam; the original absence survives

**Documents:** `01 §9`–`§10` (second half), `03 §43`–`§44`, `03 §82 Rule 6`, `05 §40`–`§41`, `06 §60`, `06 §80`, `07 §9.6`, `07 §33`

Consistent, including the explicit rejection of a separate "Makeup Exam" entity in `06 §80`.

### A-C14. Attempt snapshots preserve exactly what the student saw

**Documents:** `03 §24`, `03 §48`, `06 §51`, `06 §74`, `07 §9.2`, `07 §24`, `08 §17`

Consistent and well argued — `06 §74` works the "August answer was B, September fix made it C" example. The snapshot is declared immutable once the attempt starts.

### A-C15. Results are derived from answers; provenance is mandatory

**Documents:** `03 §48`, `05 §43`–`§44`, `06 §50`, `06 §56`, `06 §82`, `07 §10.1`, `07 §42 Invariant 11`

`Result` is a conclusion, `AttemptAnswer` is the evidence, and a result cannot exist without an attempt. `06 §50` explicitly rejects treating `Result = 86%` as the source of truth.

### A-C16. Score corrections are explicit, audited adjustments — never silent edits

**Documents:** `02 §6`, `03 §73`, `05 §53`, `06 §58`, `07 §10.2`, `07 §34`, `07 §42 Invariant 12`

Consistent, including the shared refusal to expose a generic "edit score" control and a shared adjustment vocabulary (`VOID_QUESTION`, `AWARD_MARK`, `DEDUCT_MARK`, `RECALCULATE`, `MANUAL_OVERRIDE`).

### A-C17. Audit is append-only and covers high-impact actions

**Documents:** `03 §57`, `05 §56`, `06 §63`, `07 §11.1`, `07 §3.4`, `07 §42 Invariant 15`, `08 §3`, `08 §16`, `AGENTS.md §7`

Consistent, with a near-identical action vocabulary across `03`, `05`, `06`, and `07`.

### A-C18. Subscription expiry never destroys academic data

**Documents:** `01 §48`, `03 §2`, `03 §66`, `03 §82 Rule 10`, `05 §4.2`, `07 §42 Invariant 14`, `CLAUDE.md` principle 15

Consistent and unambiguous on the principle. The _precise runtime behaviour_ during expiry is not — see `A-10`.

### A-C19. Deletion is archival by default

**Documents:** `03 §7`, `03 §17`, `05 §1.5`, `07 §3.3`, `07 §40`

Departments, subjects, classes, questions, exams, and users are deactivated or archived rather than deleted whenever they carry historical significance.

### A-C20. Offline resilience is bounded — the client never mints authority

**Documents:** `01 §10`, `03 §35`–`§36`, `05 §35`–`§36`, `08 §12.1`–`§12.2`, `09 §7`–`§10`, `09 §17`

`08 §12.1`/`§12.2` gives a clean split of what may work locally versus what requires the server. `09 §17` adds the correct prohibition on routing answer saves through the job queue. This is the most carefully specified area of the architecture.

### A-C21. Modular monolith; PostgreSQL authoritative; Redis never authoritative

**Documents:** `08 §2`, `08 §7`, `09 §11`, `09 §15`, `09 §42`, `CLAUDE.md`, `AGENTS.md §4`

Consistent across architecture, stack, and control files, including the explicit rejection of microservices and Kubernetes for the initial release.

### A-C22. The student experience is deliberately minimal

**Documents:** `01 §13` (second half), `02 §9`, `03 §30`, `03 §82 Rule 12`, `04 §52`, `04 §71`, `05 §59`

Three navigation items (Assessment, Results, Profile), no calendar, no social surface, no question-bank browsing, no visibility of other students.

### A-C23. Testing expectations exceed ordinary CRUD

**Documents:** `08 §24`, `09 §38`–`§40`, `AGENTS.md §10`

Unit, integration, contract, E2E, concurrency, reconnection/offline, load, security/tenant-isolation, data-integrity, and DR drills are all named before implementation begins. `09 §39` specifies the golden-path integration test end to end. The roadmap adopts that test as the B13/B14 exit gate.

---

## 4. Section B — Contradictions

Each entry records the documents involved, the conflicting statements, why the conflict matters, and a recommended resolution. **No specification has been changed.** Where a resolution follows clearly from the stronger or later approved architecture, the entry separates _Existing decision_ from _Recommended resolution_ so the distinction stays visible.

---

### C-01 — Global exam clock versus operator activation

**Severity:** LOW · **ADR:** none required · **Status:** OPEN (editorial)

**Documents involved:** `01 §18`, `01 §38` versus `01 §1`–`§6` (second half), `03 §29`, `05 §25`, `06 §37`, `07 §21`, `CLAUDE.md` principle 7

**Conflicting statements**

`01 §18` specifies exam creation with `Start: 10:00 AM` / `End: 11:00 AM`, and `01 §38` builds an entire "availability window" model on wall-clock start and close times. `01 §1` of the second half then states: _"I would remove the previous concept of Start: 10:00 AM / End: 11:00 AM as the primary exam mechanism"_, replacing it with operator-controlled activation.

**Why it matters**

`01` is the longest document and the one a new engineer is most likely to read first. Its first half describes a scheduling model that the rest of the corpus has abandoned. An implementer who stops reading at §38 will build a scheduler, `start_at`/`end_at` columns, and a cron-driven open/close — none of which exist in the canonical model.

**Existing decision**

The activation model. `03 §82 Rule 1`, `07 §21`, and `CLAUDE.md` principle 7 all state there is no mandatory global start/end clock.

**Recommended resolution**

No product change. Add a short editorial banner at the top of `01` marking its first half as superseded by its own second half, and naming `03`/`07` as canonical for the exam model. This is a documentation fix only and should not be applied without instruction.

---

### C-02 — An exam approval step that no state machine contains

**Severity:** MEDIUM · **ADR:** none required · **Status:** OPEN

**Documents involved:** `01 §21`, `03 §57` versus `03 §28`, `05 §24`, `06 §38`, `07 §8.1`, `02` (matrix)

**Conflicting statements**

`01 §21` proposes an exam lifecycle of `DRAFT → SUBMITTED → APPROVED → SCHEDULED → LIVE → COMPLETED → ARCHIVED`, then asks whether the HOD must approve the exam itself, and recommends: _"HOD approves questions. Once questions are approved, teachers can construct exams... without requiring another HOD approval every time. Otherwise the HOD becomes a bottleneck."_

Every canonical state machine (`03 §28`, `05 §24`, `06 §38`, `07 §8.1`) uses `DRAFT → READY → OPEN → CLOSED → COMPLETED → ARCHIVED` with `CANCELLED`, and contains no `SUBMITTED` or `APPROVED` exam state. The `02` permission matrix has no "approve exam" row.

However, `03 §57` gives an audit-trail example whose action is: _"Mr. Ade — Approved exam for activation."_ That audit action implies an approval step no state machine models.

**Why it matters**

Small, but it will surface as a stray `EXAM_APPROVED` audit action, or as a reviewer asking why exam approval is missing. The audit vocabulary is otherwise consistent across four documents and should stay that way.

**Existing decision**

No exam-level approval. HOD governs questions; teachers assemble exams from approved revisions.

**Recommended resolution**

Treat `03 §57`'s example as illustrative wording rather than a requirement. The correct audit action for that moment is `EXAM_READY` (already listed in `07 §11.1`) or `EXAM_OPENED`. Confirm the audit action vocabulary in B10 against `07 §11.1` as the canonical list.

---

### C-03 — `PAUSED` exists as a permission and a product feature, but not as a state

**Severity:** HIGH · **ADR:** ADR-0009 · **Status:** OPEN

**Documents involved:** `01 §4`–`§5` (second half), `02` (matrix, "Pause exam" row) versus `03 §28`, `05 §24`, `06 §38`, `07 §8.1`, `07 §14`

**Conflicting statements**

`01 §4` lists exam states as `DRAFT / READY / ACTIVE / PAUSED / COMPLETED / ARCHIVED` and `01 §5` devotes a full section to `PAUSED`, defining it as _"prevent new students from starting"_ while _"existing attempts remain preserved."_

`02`'s permission matrix grants "Pause exam" to School Admin, Moderator, HOD (scoped), and Teacher (during own exam) — an explicit, role-gated capability.

No canonical state machine contains `PAUSED`. `07 §14` lists exactly `DRAFT → READY → OPEN → CLOSED → COMPLETED → ARCHIVED` plus `CANCELLED`.

**Why it matters**

`02` promises a button that has no backing state. Worse, the semantics `01 §5` gives to `PAUSED` — _stop new starts, preserve running attempts_ — are **identical** to what `03 §40` and `05 §27` call "Close for New Attempts." Two names for one behaviour will produce either a redundant state or a second, subtly different code path in the exam engine. Either outcome damages the state machine that the whole execution domain depends on.

**Existing decision**

Ambiguous. The canonical state machines omit `PAUSED`; the permission matrix includes it.

**Recommended resolution**

Do not add a `PAUSED` state. Treat "Pause" as the UI label for the `OPEN → CLOSED` transition, which already carries exactly the specified semantics, and treat "Resume" as `CLOSED → OPEN`. If a genuinely distinct pause is wanted later — for example one that also suspends running attempt timers — it is a materially different feature with severe timer-integrity consequences and needs its own ADR and its own tests. **Decide before B12 begins.**

---

### C-04 — `Subject` has no department, and `Question` has no class or level

**Severity:** BLOCKER · **ADR:** ADR-0001 · **Status:** OPEN

**Documents involved:** `01 §12`, `01 §17`, `02 §2`, `03 §12`, `05 §15.3`, `05 §15.4` versus `06 §18`, `06 §25`, `07 §6.5`, `07 §7.1`, `07 §7.2`

**Conflicting statements**

_Department → subject scope is required:_
`01 §17` — _"A Mathematics HOD shouldn't see Biology questions... HOD permissions should be based on Department / Subject assignment."_
`02 §2` — a Science HOD can review Mathematics, Physics, Chemistry, Biology, but not Economics, Accounting, Literature.
`07 §6.9` — `HODAssignment` binds an HOD to a `department_id`.
`07 §41` — _"HOD: must have `HODAssignment` + Department scope to review questions."_

_But the model provides no link from department to subject:_
`06 §18` gives `Subject` the attributes school, name, code, status. `07 §6.5` repeats exactly that list. **Neither includes `department_id`.** `06 §19`'s `ClassSubject` mentions "Department where relevant" without committing.

_Class or level scope for questions is required:_
`01 §12` — question metadata includes `Class: SS2`.
`05 §15.3` — question creation fields include Subject, **Class**, Department, Topic, Subtopic, Difficulty, Marks.
`05 §15.4` — a question cannot be submitted if _"Teacher isn't assigned to that subject/class."_
`03 §14` — teacher assignment determines _"which questions they can create... which questions they can edit."_

_But the model provides no class on a question:_
`06 §25` gives `Question` the attributes school, subject, author, status. `07 §7.1` repeats that list. `07 §7.2`'s `QuestionRevision` carries topic, subtopic, difficulty, marks — **no class or level.**

**Why it matters**

This is the single most consequential gap in the specification set, and it blocks three separate subsystems:

1. **HOD review scope is uncomputable.** An HOD is assigned to a department. Questions are attached to subjects. With no department–subject relation there is no query that returns "questions awaiting review in my department." The HOD review queue — described in `04 §29`/`§30` as the second most important screen in the product — cannot be built.
2. **Teacher question scope is uncomputable.** `TeacherAssignment` → `ClassSubject` → (`ClassGroup`, `Subject`). A teacher assigned Mathematics for SS1A and SS1B must not, per `02 §1`, reach SS3 Mathematics questions. But if a question is attached only to a subject, every Mathematics teacher in the school can reach every Mathematics question, silently violating `02 §1` and `07 §42 Invariant 3`.
3. **The exam readiness check is uncomputable.** `05 §23` requires that all questions "belong to valid scope" before `DRAFT → READY`. Without a class or level on the question there is no scope to validate.

Guessing differently in two places produces incompatible schemas: adding `Question.class_id` versus adding `Question.level` versus deriving scope from `Subject.department_id` alone are three different data models with three different migration paths and three different authorization engines.

**Existing decision**

None. Prose requires scoping; the canonical model cannot express it. `06 §31` explicitly defers the taxonomy question: _"Whether Topic/Subtopic become first-class entities or remain metadata can be decided later."_

**Recommended resolution (recommendation only — requires approval)**

Two additions, both minimal and both consistent with everything else in `06`/`07`:

1. Add `Subject.department_id` (nullable, school-scoped). This makes HOD scope a two-hop join `HODAssignment → Department → Subject → Question` and requires no new entity. A nullable column preserves `06 §18`'s intent that a subject can be taught across departments; where null, the subject falls outside every HOD's automatic review scope and needs explicit assignment. _If a subject genuinely belongs to several departments, the alternative is a `DepartmentSubject` join table — this is the part of the decision that needs a product answer._
2. Add a **level** dimension to `Question` — recommended as `Question.level` (for example `SS2`) rather than `Question.class_id`. A question is a reusable academic asset (`06 §25`); binding it to one _arm_ (`SS2A`) would make it unusable for `SS2B`, contradicting the entire reusable-question-bank premise. Level is the correct granularity for reuse, and teacher scope is then validated as: the teacher holds an active `TeacherAssignment` to some `ClassSubject` whose `Subject` matches the question and whose `ClassGroup.level` matches the question's level.

**Both parts must be decided before B5 (academic structure) freezes its schema, and certainly before B8 (question bank).**

---

### C-05 — Publication is modelled twice, in two places, with two lifecycles

**Severity:** HIGH · **ADR:** ADR-0010 · **Status:** OPEN

**Documents involved:** `07 §10.1` versus `07 §10.3`, `06 §54`, `06 §59`, `05 §45`

**Conflicting statements**

`07 §10.1` gives `Result` a `state` field whose enum is `PROCESSING / FINAL / PUBLISHED / UNPUBLISHED / ADJUSTED`, plus a `published_at` attribute.

`07 §10.3` defines a separate `ResultPublication` entity with its own `published_by`, `published_at`, and `status` enum of `PUBLISHED / UNPUBLISHED`.

`06 §59` explains the separate entity's purpose: _"This lets us support Teacher publishes / School Admin publishes / Automatic publication **without changing the Result itself**."_

**Why it matters**

The two designs are mutually exclusive in practice. If publication lives on `Result.state`, then publishing an exam's results is a bulk update across every result row, `06 §59`'s stated benefit is lost, and `Result.state` conflates two orthogonal axes — _marking lifecycle_ (`PROCESSING`, `FINAL`, `ADJUSTED`) and _visibility_ (`PUBLISHED`, `UNPUBLISHED`). A result that is both `ADJUSTED` and `PUBLISHED` cannot be represented at all, and adjusting a published result would silently unpublish it.

If publication lives in `ResultPublication`, then `Result.state` must lose `PUBLISHED`/`UNPUBLISHED`, and the student results query becomes a join. Either way, one of the two must be corrected before the results schema is written.

There is also an unresolved granularity question underneath: `06 §59` says `ResultPublication` covers "Exam/result scope" — meaning one publication row could govern an entire exam or a single result. `04 §49` and `05 §48` both show publication as a per-exam teacher action ("Publish Results" on the exam result screen), never per-student.

**Existing decision**

Contradictory within a single document (`07`).

**Recommended resolution (recommendation only)**

Keep `ResultPublication` as the authority for visibility, scoped **per exam** (matching the only UI ever described), and reduce `Result.state` to the marking lifecycle only: `PROCESSING / FINAL / ADJUSTED`. Student visibility is then `Result.state ∈ {FINAL, ADJUSTED}` **and** an active `ResultPublication` exists for the exam. This keeps the two axes independent, preserves `06 §59`'s rationale, makes publish and unpublish single-row operations, and lets an adjusted result stay published.

---

### C-06 — Software Admin: full academic authority, or audited break-glass?

**Severity:** HIGH · **ADR:** ADR-0012 · **Status:** OPEN

**Documents involved:** `02` (matrix) versus `02 §5`, `03 §2`, `08 §10`, `AGENTS.md §6`

**Conflicting statements**

`02`'s matrix grants Software Admin **Full** on numerous school academic rows: View question bank, Archive question, Import/Export questions, Archive exam, Exam Control Center, View live attempts, **Manually allow student**, **Grant makeup access**, **Mark/confirm absence**, **End individual attempt**, **Invalidate attempt**, View exam results, View individual student result, Export CSV, Promote students, Graduate/archive students, Force password reset, Deactivate account.

`02 §5` then states the opposite intent: _"this doesn't mean Software Admin should casually modify academic content... Software Admin has **emergency/support-level access**, with all such actions audited. That is important for customer trust. We don't want a platform operator casually editing a school's examination questions or scores."_

`08 §10` splits the difference: _"platform-wide authority, with sensitive school-content operations audited."_

The matrix also contradicts itself: Software Admin is **—** (no access) for "Create exam", "Publish results", and "Unpublish results", yet **Full** for "Invalidate attempt" and "Grant makeup access" — a strictly more dangerous set of operations.

**Why it matters**

This determines whether the authorization engine treats `SOFTWARE_ADMIN` as a wildcard that satisfies every school-scoped check, or as a role that must pass an explicit break-glass gate (justification required, elevated audit event, possibly time-boxed). Building the wildcard first and retrofitting break-glass later means revisiting every guard in the application. It is also a commercial-trust question: schools are being asked to run high-stakes examinations on this platform.

**Existing decision**

Contradictory within a single document. `02 §5` and `08 §10` both point toward audited/emergency access; the matrix cells say Full.

**Recommended resolution (recommendation only)**

Adopt `02 §5` as the intent and implement Software Admin school-academic access as **read + break-glass write**:

- Platform operations (school CRUD, subscription, activation, platform analytics, platform audit) — unrestricted.
- School academic **reads** — permitted, audited.
- School academic **writes** (invalidate attempt, grant makeup, archive question, force reset, deactivate account) — permitted only through an explicit break-glass path requiring a stated reason, emitting a distinct elevated audit event, and surfaced to the School Admin in their own audit view.
- Content authoring (create exam, create/approve question, publish results) — denied outright, matching the matrix's own **—** cells.

---

### C-07 — "Limited" exam-creation rights are undefined and internally inconsistent

**Severity:** MEDIUM · **ADR:** folded into ADR-0012 and A-03 · **Status:** OPEN

**Documents involved:** `02` (matrix) versus `03 §25`, `05 §19.2`, `04 §35`, `04 §42`

**Conflicting statements**

`02`'s matrix, "Create exam" row: Software Admin **—**, School Admin **Limited**, Moderator **Limited**, HOD **Limited**, Teacher **Full scoped**.

The very next rows give School Admin and Moderator **Full** on "Edit draft exam", "Delete draft exam", and "Add questions to exam" — capabilities strictly greater than the "Limited" creation right above them.

Meanwhile `03 §25`, `05 §19.2`, `04 §35`, and `04 §42` describe exam creation exclusively as a teacher workflow. `04 §20` states the Moderator workspace should _not_ prominently expose question governance, and `04 §35` lists the Teacher workspace as the exam builder's home. No document defines what "Limited" creation means.

**Why it matters**

"Limited" appears in the matrix without being in the matrix's own legend, which defines only Full, View, Scoped, —, and System. Three engineers will implement three different behaviours. This also affects the frontend: does the Moderator workspace get an exam builder route at all?

**Existing decision**

None; the term is undefined.

**Recommended resolution (recommendation only)**

Resolve as part of A-03 (the permission vocabulary). The audit's reading of `04`'s workspace design is that exam **authoring** is a teacher capability, while School Admin and Moderator hold exam **administration** capabilities (open, close, allow students, grant makeup, publish) plus the ability to edit or delete a draft on a teacher's behalf. Under that reading, "Limited" for Create exam should become **—**, and the existing Full cells on Edit/Delete/Add-questions stand. If instead the intent is that a Moderator can author an exam end to end, `04`'s Moderator workspace needs an exam-builder route added.

---

### C-08 — Is per-student session authorization mandatory, or only for batch gating?

**Severity:** BLOCKER · **ADR:** ADR-0006 · **Status:** OPEN

**Documents involved:** `03 §31`, `03 §38`, `05 §26` versus `07 §22`, `07 §13`, `06 §43`, `05 §29`

**Conflicting statements**

_Eligibility appears sufficient:_
`03 §31` — when an exam opens, the system checks student active, correct school, session, class, subject eligibility, no completed attempt, not currently disallowed; _"Only eligible students are shown the exam."_
`05 §26` gives the same list.
`03 §30` — once the teacher opens the exam, _"eligible students can see it."_

_Explicit authorization appears mandatory:_
`07 §22` Phase 3 — _"For each student, `ExamSessionParticipant` is created or activated,"_ with the worked example _"40 students → 20 authorized → 20 waiting. The first 20 see the assessment."_
`07 §13` cardinality — `ExamSessionParticipant → Attempt` is `1:0..N`, implying an attempt hangs off a participant record.
`06 §43` — the entity exists _"to say Student 21 is allowed to participate in Session 2."_

**Why it matters**

These describe two different products. Under eligibility-only, opening an exam makes it visible to the whole class immediately and `ExamSessionParticipant` is an optional gating layer used only when the lab is too small. Under mandatory authorization, a teacher with 40 students and 40 computers must still explicitly authorize all 40 before anyone can start — which `03 §38`'s own narrative does not do, and which would make the common case worse.

The choice determines: the `ExamAttempt` foreign-key shape (is `exam_session_id` nullable?), whether the student's "available assessment" query joins through participants, the Exam Control Center's default view, and the entire F12 batch-control UI.

`06 §43` hints at the resolution — _"This is particularly valuable for **explicit batch control** and makeup administration"_ — suggesting the entity is for the gated case. But `07 §22` states it unconditionally as Phase 3 of the canonical transaction.

**Existing decision**

Contradictory between `03`/`05` and `07`.

**Recommended resolution (recommendation only)**

Make it an **exam-level policy flag** with `ExamSessionParticipant` always written, never skipped:

- `access_mode = OPEN_TO_ELIGIBLE` (default): opening a session authorizes every currently eligible student; the system writes `ExamSessionParticipant` rows for them automatically. The teacher does nothing extra in the 40-students/40-computers case.
- `access_mode = EXPLICIT_AUTHORIZATION`: no student may start until named, matching `07 §22`'s worked example and the 40-students/20-computers case.

This satisfies both documents, keeps `07 §13`'s cardinality honest (every attempt still traces to a participant record), preserves the audit trail of who was allowed to sit when, and makes the batch case an explicit choice rather than a hidden default. **Decide before B12.**

---

### C-09 — Question pools: in scope per `05`, absent from the canonical model

**Severity:** BLOCKER · **ADR:** ADR-0002 · **Status:** OPEN

**Documents involved:** `05 §21`, `01 §19` versus `06 §34`, `07 §8.3`, `07 §24`, `04 §42`

**Conflicting statements**

`05 §21`, headed _"Question Pool / Random Selection"_, states: _"**Production scope should support both**: Fixed exam — teacher explicitly selects questions. Question pool — teacher configures Topic: Algebra, Difficulty: Mixed, **Pool size: 30, Questions shown: 10**. The system selects from the pool."_ It adds that this _"gives us a strong future-facing exam engine without requiring separate exams for every student."_

`01 §19` describes a weaker variant — "Generate 50 questions from Mathematics SS2" — which reads as a build-time convenience that materialises fixed `ExamQuestion` rows.

The canonical model has no pool. `07 §8.3` binds `ExamQuestion` to one `question_revision_id` with a `sequence` and `marks`. `07 §24` Phase 5 builds the attempt snapshot by iterating `ExamQuestion → AttemptQuestionSnapshot`. `04 §42` shows the exam builder as a checkbox list of approved questions, with "Generate from question pool" explicitly labelled _"future functionality."_

**Why it matters**

`05 §21`'s "Pool size 30, Questions shown 10" means **different students receive different questions**. That is not a presentation concern like question-order randomization — it changes the assessment itself, and it invalidates several things the rest of the corpus assumes:

- **Snapshot construction** (`07 §24`) iterates `ExamQuestion`. With a pool, the draw must happen per attempt, before snapshotting, inside the start transaction — a materially different and more failure-sensitive start path.
- **Question analytics** (`05 §52`, `03 §54`) reports "Question — Attempts — Correct %". With a pool, each question has a different denominator, and the "Q3: 37% correct" comparison across students becomes statistically invalid unless the report is rewritten to account for unequal exposure.
- **Total marks** (`07 §10.1` `total_marks`) must be provably equal across attempts, or students sit exams of different maximum value. Nothing specifies how a pool guarantees this.
- **Exam readiness** (`05 §23`) validates "at least one question, all approved". A pool needs different validation: pool size ≥ questions shown, all pool members approved, marks homogeneous.
- **`04 §42` directly contradicts `05 §21`**, calling pools future functionality.

**Existing decision**

Contradictory. `05` (normative behaviour) says production scope; `04`, `06`, and `07` model only fixed selection.

**Recommended resolution (recommendation only)**

The audit recommends **fixed selection for the initial release**, with pools deferred and recorded as an approved-but-deferred item — on three grounds: `06` and `07` are the later and more authoritative documents and contain no pool concept; `04 §42` independently labels it future functionality; and the takeover brief's instruction not to remove approved scope is best served by an explicit deferral decision rather than a silent one.

**This is exactly the kind of call the brief says must not be made silently.** If pools are confirmed in scope, B11 and B13 both grow materially, `07 §24`'s snapshot phase must be respecified, and question analytics (B17) needs an exposure-weighted design. The roadmap currently assumes fixed selection and flags the affected phases. **Decide before B11.**

---

### C-10 — HOD "request/approve" workflow that exists nowhere else

**Severity:** MEDIUM · **ADR:** ADR-0017 · **Status:** OPEN

**Documents involved:** `02` (matrix) versus `03`, `04`, `05`, `06`, `07` (all silent)

**Conflicting statements**

`02`'s matrix contains three cells describing a request/approval mechanism:

- "Assign teacher → subject": HOD **Limited/request**
- "Assign teacher → class": HOD **Limited/request**
- "Move student between classes": HOD **Request/approve**
- "Invalidate attempt": Teacher **Request / limited**

No other document describes a request workflow. There is no request entity in `06` or `07`, no request screen in `04`, no request behaviour in `05`, and no request notification type in `06 §64`'s list.

**Why it matters**

Four permission cells promise a feature with no model, no screen, and no state machine. If taken literally it implies a general-purpose approval-request subsystem — a significant piece of work — bolted onto four unrelated operations.

**Existing decision**

None.

**Recommended resolution (recommendation only)**

Withdraw the request semantics for the initial release and read those cells as **—** (HOD cannot change assignments or move students; those are Moderator and School Admin operations, which the same matrix already grants them at Full). For "Invalidate attempt", read Teacher as **Full for own exam** — consistent with the adjacent "End individual attempt: Teacher — Own exam" cell — with the action requiring a reason and emitting `ATTEMPT_INVALIDATED`, which `05 §30` already specifies. If a request/approval subsystem is genuinely wanted, it needs its own specification and its own roadmap phase; it is not currently costed anywhere.

---

### C-11 — Exceptional reattempt is authorized by nothing

**Severity:** HIGH · **ADR:** ADR-0014 · **Status:** OPEN

**Documents involved:** `03 §45`, `03 §75`, `05` (edge-case matrix), `07 §9.1` versus `06 §60`, `07 §9.6`, `02` (matrix)

**Conflicting statements**

`03 §45` — _"privileged users can authorize **Exceptional Reattempt**, which should be extremely visible in the audit trail."_
`03 §75` — _"If special permission is granted: New attempt must be explicitly authorized."_
`05`'s edge-case matrix — _"Student tries to reopen submitted exam → Denied unless authorized exceptional reattempt."_
`07 §9.1` — `attempt_type` includes `RETRY`, and `attempt_limit` exists on `Exam`.

But the only authorization entity in the model is `MakeupAuthorization` (`06 §60`, `07 §9.6`), which is scoped to absence: its `status` enum is `AUTHORIZED / USED / REVOKED / EXPIRED` and `07 §9.6` states _"Makeup authorization creates another attempt; it does not modify the original absence."_ Nothing authorizes a `RETRY` for a student who **did** sit the exam.

The `02` matrix has no "authorize reattempt" row at all — only "Grant makeup access".

**Why it matters**

`07 §42 Invariant 8` says _"A submitted attempt is never reopened"_ and `07 §9.1` invariant 1 says a student cannot exceed `attempt_limit` completed attempts. With `attempt_limit = 1` (the specified default) and no authorization entity for `RETRY`, the documented exceptional-reattempt capability is unimplementable — a teacher facing a genuinely corrupted attempt has no legitimate path except invalidating the original, which changes its meaning.

The interaction with `attempt_limit` is also unspecified: does an authorized retry raise the limit for that student, or bypass the check entirely? Does an invalidated attempt count toward the limit? (See `X-12`.)

**Existing decision**

None. The capability is described in three documents and modelled in none.

**Recommended resolution (recommendation only)**

Generalise `MakeupAuthorization` into an **`AttemptAuthorization`** entity carrying a `type` of `MAKEUP` or `RETRY` (extensible to `SPECIAL`), keeping all existing fields (`authorized_by`, `reason`, `authorized_at`, `expires_at`, `status`). Then state the rule explicitly: an attempt may be created if the student is under `attempt_limit` **or** holds an unused `AttemptAuthorization`; authorizations are single-use and transition to `USED`. Add `ATTEMPT_RETRY_AUTHORIZED` to the audit vocabulary and a matching permission row. Also settle whether `INVALIDATED` and `CANCELLED` attempts count toward `attempt_limit` — the audit recommends they do not.

---

### C-12 — Who owns result visibility: the school, or the teacher who built the exam?

**Severity:** HIGH · **ADR:** folded into ADR-0010 · **Status:** OPEN

**Documents involved:** `01 §26`, `03 §49`, `05 §47`, `05 §58` versus `06 §33`, `07 §8.1`, `04 §43`

**Conflicting statements**

_School-level:_
`01 §26` — _"Yes, but **configurable by School Admin**."_
`05 §47` — three policies (Teacher publishes / School Admin publishes / Automatic); _"**School Admin configures the default**."_
`05 §58` — Settings → Assessment includes "Result publication policy", "Student result visibility".
`03 §49` — _"The exam can have a **school-controlled** result policy."_

_Exam-level:_
`06 §33` and `07 §8.1` both give `Exam` a `result_policy` attribute.
`04 §43` shows the teacher's Exam Rules screen setting `Result Visibility: After Teacher Publishes`.

**Why it matters**

`05 §47` says School Admin sets _the default_, which implies exams may override it — but `05 §66` lists "Result publication" under **school-configurable policies**, and `05 §67` lists things that must **not** be configurable. If a teacher can override the school's policy to "Automatic", a school that deliberately requires administrative release loses that control, and there is no stated guard preventing it. Conversely if the exam value is always forced from the school setting, `04 §43`'s teacher control is misleading UI.

There is a second, sharper question: `05 §47`'s policies name _who publishes_, while `04 §43`'s control names _when students see results_. These are related but not identical, and both are stored in one `result_policy` field.

**Existing decision**

Partially specified: school sets the default, exam carries a value. The override rule is undefined.

**Recommended resolution (recommendation only)**

Keep `Exam.result_policy` as the effective value, seeded from the school default at exam creation, and add a school setting that determines whether teachers may change it (`result_policy_locked`). Separate the two concerns: `result_policy` = who releases (`TEACHER` / `SCHOOL_ADMIN` / `AUTOMATIC`), and a distinct `result_detail_visibility` = what the student sees once released (score only / score + counts / full question review), since `01 §28`, `03 §50`, and `05 §51` all describe that second axis independently.

---

### C-13 — Two status fields govern access, with mismatched enums

**Severity:** HIGH · **ADR:** ADR-0016, ADR-0015 · **Status:** OPEN

**Documents involved:** `06 §2`, `07 §4.1` versus `06 §4`, `07 §4.2`, `05 §4.1`, `03 §66`

**Conflicting statements**

`School.status` (`06 §2`, `07 §4.1`): `PROVISIONAL / ACTIVE / SUSPENDED / EXPIRED / DEACTIVATED`
`Subscription.status` (`06 §4`, `07 §4.2`): `PENDING / ACTIVE / EXPIRING / EXPIRED / SUSPENDED / CANCELLED`

Both carry `ACTIVE`, `SUSPENDED`, and `EXPIRED`. Neither document states which one gates access. `03 §66` shows _"School status: EXPIRED"_ driving the restricted behaviour; `05 §4.2` describes expiry entirely in subscription terms.

Additionally, `05 §4.1` lists subscription states as `ACTIVE / EXPIRING_SOON / EXPIRED / SUSPENDED` — the enum value is `EXPIRING_SOON`, whereas `06`/`07` say `EXPIRING`. `05` also omits `PENDING` and `CANCELLED`.

**Why it matters**

Two overlapping status fields on the hot path of every request is a correctness hazard: they can disagree, and the authorization layer must pick one. If the guard reads `School.status` but a background job expires `Subscription.status`, schools keep working past expiry — or worse, the reverse, and a paying school is locked out mid-examination. `07 §42 Invariant 14` protects the _data_ on expiry but says nothing about which field is consulted.

The enum mismatch is smaller but real: `EXPIRING` versus `EXPIRING_SOON` will be written into a Prisma enum once and referenced everywhere.

**Existing decision**

None on precedence. `06`/`07` are canonical for the enum values, so `EXPIRING` wins over `EXPIRING_SOON`.

**Recommended resolution (recommendation only)**

Make `Subscription` the source of commercial truth and `School.status` the **derived, cached** access gate maintained by the subscription lifecycle — with a single documented resolution function used by every guard. Remove `EXPIRED` from `School.status`'s meaning as an independently settable value; it becomes a projection of the active subscription. `SUSPENDED` and `DEACTIVATED` remain independently settable by Software Admin, since those are platform actions unrelated to billing and must be able to override an otherwise-valid subscription. Document the precedence explicitly: `DEACTIVATED` > `SUSPENDED` > subscription-derived state.

---

### C-14 — Account lifecycle states are split across entities inconsistently

**Severity:** LOW · **ADR:** none required · **Status:** OPEN

**Documents involved:** `03 §17`, `03 §81`, `05 §9.4` versus `07 §5.1`, `07 §5.4`, `07 §5.2`; and `03 §2` versus `07 §4.1`

**Conflicting statements**

_Student states:_ `03 §17`, `03 §81`, and `05 §9.4` all give the student lifecycle as `INVITED → ACTIVE → SUSPENDED → INACTIVE → GRADUATED → ARCHIVED`.
`07 §5.1` gives `User.status` as `INVITED / ACTIVE / SUSPENDED / INACTIVE` — no `GRADUATED`, no `ARCHIVED`.
`07 §5.4` gives `StudentProfile` a separate `status` with no enumerated values.
`07 §5.2` gives `SchoolMembership` a third status: `PENDING / ACTIVE / INACTIVE / ENDED`.

_School states:_ `03 §2` and `03 §81` include `REACTIVATED` as a school state; `06 §2`, `07 §4.1`, and `05 §3.1` do not.

**Why it matters**

Three status fields (`User`, `SchoolMembership`, `StudentProfile`) with overlapping vocabularies and no stated precedence is a recipe for a student who is `ACTIVE` on one and `INACTIVE` on another. `GRADUATED` clearly belongs to the academic profile, not the account. Minor, but it must be settled once before B1 writes the identity schema, or every subsequent guard will check the wrong field.

**Existing decision**

`07` is canonical, so `User.status` has four values and `REACTIVATED` is not a school state.

**Recommended resolution (recommendation only)**

Assign each status a single, documented meaning and let the guard consult all three in a fixed order:

- `User.status` — can this person authenticate at all (`INVITED / ACTIVE / SUSPENDED / INACTIVE`).
- `SchoolMembership.status` — is this person currently part of this school (`PENDING / ACTIVE / INACTIVE / ENDED`).
- `StudentProfile.status` — academic standing only (`ACTIVE / GRADUATED / WITHDRAWN / ARCHIVED`).

Treat `REACTIVATED` as a transition back to `ACTIVE`, not a state — the reactivation fact is already preserved by the audit event and the `ActivationGrant` history, so no state is needed to record it.

---

## 5. Section C — Ambiguities

Requirements that are not precise enough to implement without a guess. Each records the source, why implementations could diverge, and a recommended interpretation.

---

### A-01 — Login does not resolve a tenant

**Severity:** BLOCKER · **ADR:** ADR-0005

**Location:** `04 §2` (login screen), `07 §5.1` (`login_identifier`), `08 §10`, `09 §24`

**The gap**

`04 §2` shows a login form with `Username / Student ID` and `Password`, branded with the school's logo and colour. `07 §5.1` gives `User` a `login_identifier`. `09 §24` lists the credential types as "Student ID / username" per role.

Nothing states **how a login request determines which school it belongs to**. Student IDs are school-issued (`ST001` in `03 §15`) and are only unique within a school; two schools will both have `ST001`. `07 §5.1` places `login_identifier` on `User`, which is tenant-independent.

**Why implementation could diverge**

At least four incompatible designs satisfy the text: global uniqueness of `login_identifier` across all schools (breaks `ST001`); per-school subdomains (`greenfield.atlas.app`) resolving tenant before auth; a school-code field on the login form; or invitation-link-scoped login. Each produces a different `User` unique constraint, a different session shape, a different DNS and TLS strategy, and a different first screen. `04 §2` also states the login page shows _the school's_ logo and colour — which is impossible to render before the tenant is known, so this is a frontend blocker as much as a backend one.

**Recommended interpretation (recommendation only)**

Per-school subdomain as the primary resolution mechanism, with `login_identifier` unique **per school** rather than globally, plus a platform-level login at a distinct host for Software Admin (which `04 §2` already requires: _"For Software Admin, the platform has a distinct platform-branded login rather than pretending to be a particular school"_). This is the only option that satisfies `04 §2`'s school-branded login without an extra step, and it matches the multi-tenant branding model in `03 §5`. It has real infrastructure consequences — wildcard DNS, wildcard TLS, and tenant resolution at the edge — which is precisely why it needs deciding at B0, not B1.

---

### A-02 — Credential format, password policy, and first-login distribution are unspecified

**Severity:** MEDIUM · **ADR:** folded into ADR-0005, ADR-0019

**Location:** `03 §11` ("Temporary credential/invitation"), `03 §15`, `05 §9.3` ("Reset credentials"), `09 §24`

**The gap**

Users are created in bulk from CSV (`03 §15`, `05 §10`) with no email column in the specified template (`Student ID | Name | Class | Department`). `03 §11` says a moderator receives a "Temporary credential/invitation". `05 §9.3` lists "Reset credentials" as an action. No document specifies: password complexity rules, whether students get a system-generated password or set their own, how a 1,500-student import distributes credentials, session lifetime, or lockout thresholds.

**Why implementation could diverge**

A student import producing 1,500 random passwords needs a printable distribution artefact — which is a real feature nobody has costed. If instead students set their own password on first login, they need a delivery channel to receive an invitation, and the CSV template has no email or phone column.

**Recommended interpretation (recommendation only)**

For students: system-generated initial password, forced change on first login, with the Moderator able to export a one-time credential sheet per class immediately after import — this is the only design that works for a Nigerian secondary school where most students have no institutional email. For staff: invitation link delivered by the messaging channel in ADR-0019, with a password set by the user. Password policy: minimum length with a breach-list check rather than composition rules, and Argon2id hashing per `09 §24`.

---

### A-03 — The permission matrix vocabulary is undefined

**Severity:** BLOCKER · **ADR:** ADR-0012 (Software Admin portion); vocabulary itself needs settling in B2

**Location:** `02` (legend and matrix body)

**The gap**

`02`'s legend defines exactly five terms: **Full**, **View**, **Scoped**, **—**, **System**. The matrix body then uses at least fourteen more that are never defined:

`Limited`, `Authorized`, `Department`, `Own`, `Own actions`, `Own account`, `Assigned`, `Assigned class`, `Assigned students`, `Own exams`, `Own exam`, `Full own exam`, `Full scoped`, `Full department`, `Limited/request`, `Request/approve`, `Configurable`, `Available only`, `Own published results`, `Respond to feedback`, `Edit & resubmit`, `Full / One-time`, `Request/enter key`.

**Why implementation could diverge**

This is the specification that the entire authorization engine is built from, and roughly a third of its cells use undefined vocabulary. "Limited" appears on School Admin exam creation, Moderator school settings, Moderator department analytics, School Admin question archive, School Admin question import/export, HOD force-password-reset, and Moderator audit log — plausibly meaning something different each time. "Department" as a permission value presumably means "scoped to the user's assigned department", but that is an inference.

**Why it is a BLOCKER**

B2 (authorization engine) must encode these cells as executable policy. Encoding an undefined term means guessing, and a wrong guess in either direction is a security defect — too permissive leaks across scope boundaries, too restrictive breaks documented workflows. The B2 deliverable includes producing a **normalised permission table** derived from `02`, with every cell mapped to a defined scope predicate, reviewed and approved before the guards are written.

**Recommended interpretation (recommendation only)**

Reduce the vocabulary to a small closed set of scope predicates — `NONE`, `SELF`, `OWNED`, `ASSIGNED`, `DEPARTMENT`, `SCHOOL`, `PLATFORM` — crossed with an action set (`CREATE`, `READ`, `UPDATE`, `DELETE`, `EXECUTE`). Every one of `02`'s cells is then re-expressed as (action set × scope predicate), with the resulting table reviewed against `02` cell by cell. Ambiguous cells (`Limited`, `Request/approve`) are resolved by the relevant ADR rather than by the engineer writing the guard.

---

### A-04 — What makes an exam visible to a student?

**Severity:** BLOCKER · **ADR:** ADR-0006

**Location:** `03 §30`–`§31`, `05 §26`, `07 §22`–`§23`, `04 §53`

**The gap**

This is the query behind the single most-hit student endpoint, and three documents specify it differently. See `C-08` for the underlying contradiction. Beyond that contradiction, the eligibility list itself contains an unresolvable term: `03 §31` requires _"Eligible for subject?"_ — but with no student–subject registration entity (`M-02`), subject eligibility cannot be evaluated for a student in a class where not everyone takes every subject.

**Why implementation could diverge**

`05 §26`'s list has nine conditions; `03 §31`'s has eight; `07 §23`'s re-validation at start has seven, and they are not the same seven. An implementer will pick one list. The start-time re-validation in `07 §23` is the security-critical one and must be a superset of whatever the visibility query uses.

**Recommended interpretation (recommendation only)**

Define **one** eligibility predicate used by both the visibility query and the start-attempt transaction, with the start path re-evaluating it under lock (`X-03`). Resolve subject eligibility per ADR-0011: if electives are not modelled, subject eligibility reduces to "the exam's `ClassSubject` exists and is active for the student's enrolled class", which is computable today.

---

### A-05 — Participation roll-up across multiple sessions is undefined

**Severity:** HIGH · **ADR:** ADR-0024

**Location:** `07 §9.5` (`ExamParticipation`), `03 §41`, `05 §42`, `07 §33`

**The gap**

`07 §9.5` gives `ExamParticipation` both an `exam_id` and an `exam_session_id`. `07 §33` describes an absent student getting `ExamParticipation status = ABSENT` at session close, then later a makeup session producing an attempt — while _"the original absence remains."_

It is not stated whether a student has **one** participation record per exam or **one per session**. If per session, a student absent in Session 1 and present in the makeup has two rows — and no document says how to render "was this student absent?" on the exam report. If per exam, the makeup attempt must mutate the existing `ABSENT` row, which contradicts `03 §82 Rule 6` and `07 §42 Invariant 10`.

**Why implementation could diverge**

The Exam Control Center summary (`Registered / Not Started / In Progress / Submitted / Absent`, `05 §28`) and every participation export (`05 §54`) depend on this. Counting rows naively double-counts students who sat a makeup.

**Recommended interpretation (recommendation only)**

One `ExamParticipation` row **per (exam, session, student)** — preserving history per `07 §33` — plus a documented roll-up rule for exam-level reporting: a student's exam-level participation is `ATTENDED` if any session produced a non-invalidated attempt, otherwise `ABSENT` if any session recorded absence, otherwise `PENDING`. Reports must state which view they present, and the makeup case must show both facts (`Original: Absent / Makeup: Completed`) exactly as `03 §43` requires.

---

### A-06 — There is no defined post-expiry cutoff policy

**Severity:** BLOCKER · **ADR:** ADR-0003

**Location:** `08 §11.4`

**The gap**

`08 §11.4` states: _"When the server receives an answer after expiry, the server applies **the defined cutoff policy** rather than trusting client time."_

**No document defines that policy.** This is a direct forward reference to something that was never written.

**Why implementation could diverge**

A student writes an answer at `expires_at − 2s`; the request arrives at `expires_at + 400ms` because of school-network latency. Three defensible behaviours: accept it (client timestamp within window, trusting a client-supplied timestamp — which `08 §11.4` itself warns against); reject it (correct but penalises students for network latency they cannot control, on unstable Nigerian school networks); or accept within a bounded grace window using the server's receipt time.

`09 §48` explicitly flags this as an area to be conservative in: _"we need to test online → offline → refresh → reconnect → submit under many variations."_

**Recommended interpretation (recommendation only)**

A bounded grace window measured against **server receipt time**: accept answer writes arriving up to N seconds after `expires_at` (suggested N = 60, configurable per environment, not per school), record `answered_at` as the server receipt time, and mark such writes with a flag so they are visible in the attempt audit. Reject beyond the window. Never trust a client-supplied timestamp to decide admissibility. Offline queues flushed after reconnection are subject to the same rule, which means a student offline for ten minutes past expiry loses those answers — a consequence that must be stated in the student-facing instructions (`05 §71`) so it is not a surprise.

---

### A-07 — Answer persistence granularity and history

**Severity:** HIGH · **ADR:** ADR-0007

**Location:** `07 §9.3`, `06 §49`, `08 §11.2`

**The gap**

`07 §9.3` gives `AttemptAnswer` a `last_saved_at` and then states, with unusual hedging: _"The latest saved answer is not overwritten in a way that destroys historical audit context **if audit-grade answer history is required**. At minimum, final submitted state must remain reconstructable."_

This leaves the requirement genuinely undecided — the document says "if required" without saying whether it is required.

**Why implementation could diverge**

Two very different schemas: one mutable `AttemptAnswer` row per question updated in place (small, fast, no history), or an append-only answer-event log with the current answer derived or materialised (larger, slower, fully auditable). At 1,000 concurrent students changing answers, the write volume differs by an order of magnitude, and `08 §20`'s exam write-pressure model depends on which is chosen.

**Recommended interpretation (recommendation only)**

One mutable `AttemptAnswer` row per (attempt, question) for the interactive path — this is the hot path and must stay small per `09 §45` — **plus** an append-only `AttemptAnswerEvent` written in the same transaction, retained for a bounded period (suggested: through the exam's result finalisation plus a defined window). This satisfies "final submitted state must remain reconstructable" and gives real dispute-resolution evidence, while keeping the read path a single indexed row. If the event log proves too costly under load testing (B21), it can be reduced to sampling or disabled per environment without a schema change — which is why writing it from the start is cheaper than retrofitting.

---

### A-08 — Randomization determinism and seed storage

**Severity:** HIGH · **ADR:** folded into ADR-0008

**Location:** `06 §52`–`§53`, `07 §9.2`, `08 §17`

**The gap**

`06 §52` establishes that randomization is an attempt-level concern and _"the attempt snapshot records the actual order."_ `07 §9.2` gives the snapshot a `display_sequence` and `options_snapshot`. Nothing states whether the randomization seed is stored, or whether the order must be reproducible from inputs.

**Why implementation could diverge**

If the order is materialised into the snapshot (as `07 §9.2` implies), no seed is needed and the order is trivially auditable. If instead the order is computed on read from a seed, the seed becomes load-bearing and must be immutable. A hybrid — order in the snapshot but options re-shuffled per request — would be a serious integrity defect, letting a student refresh to get a different option order and infer information.

**Recommended interpretation (recommendation only)**

Materialise both orders fully into the snapshot at attempt start, exactly as `07 §9.2` describes, and store the seed as well for forensic reproducibility. Never compute presentation order at read time. Add an explicit test: refreshing mid-attempt returns byte-identical question and option ordering (this is a B13 test requirement).

---

### A-09 — Publication granularity

**Severity:** HIGH · **ADR:** ADR-0010

**Location:** `07 §10.3` ("result/result scope"), `06 §59` ("Exam/result scope"), `04 §49`, `05 §48`

**The gap**

Both `06 §59` and `07 §10.3` describe `ResultPublication` as covering "Exam/result scope" without choosing. Every UI description (`04 §49`, `05 §48`) shows publication as a per-exam action.

**Why implementation could diverge**

Per-result publication allows a teacher to publish 37 of 40 results — useful when three are under dispute, but it creates a partial-publication state nothing else models, and it makes "is this exam published?" unanswerable. Per-exam publication is simpler and matches the UI, but cannot withhold a single disputed result.

**Recommended interpretation (recommendation only)**

Per-exam publication as the modelled scope, with individual withholding expressed as an attribute of the _result_ (for example a `withheld` flag set through an audited action with a reason) rather than by fragmenting publication. This keeps "is this exam published?" a single-row answer while still supporting the dispute case.

---

### A-10 — Subscription expiry runtime semantics

**Severity:** HIGH · **ADR:** ADR-0015

**Location:** `03 §66`–`§67`, `05 §4.2`, `01 §48`

**The gap**

The principle is clear and consistent (`A-C18`): no data destruction. The runtime behaviour is not. `03 §66` sketches _"Students: No exam access / Teachers: No new exams / Administrators: Can view renewal information / Data: Preserved"_ but marks the grace period as _"a commercial decision later."_ `03 §67` states that an already-started attempt _"should not suddenly disappear"_ and must be _"preserved and finalized safely"_ — without saying whether the student may continue answering, or only submit.

**Why implementation could diverge**

The guard must answer, for a school whose subscription expired 30 seconds ago with 400 students mid-exam: can they keep answering? Can they submit? Does marking still run? Can the teacher still see the Control Center? Can results be published afterwards? Each is a separate decision and each has a defensible answer.

**Recommended interpretation (recommendation only)**

Define an explicit `EXPIRED` capability profile: existing `IN_PROGRESS` attempts may continue to completion (answer writes and submission both permitted), marking and result finalisation run normally, and the Control Center stays available read-plus-close for the duration — because `03 §67`'s principle is meaningless if the exam cannot actually finish. Blocked: opening new exam sessions, starting new attempts, creating exams, and bulk imports. Read access to historical data and renewal screens remains. Add a grace period (suggested 14 days) during which everything still works, with escalating warnings, so expiry never lands mid-examination-week by surprise.

---

### A-11 — What happens to a `Result` when its attempt is invalidated?

**Severity:** HIGH · **ADR:** ADR-0025

**Location:** `07 §10.1` (`ExamAttempt 1 ──── 1 Result`), `07 §16`, `05 §30`, `03 §76`

**The gap**

`07 §13` and `07 §10.1` state the relationship is strictly 1:1 and _"a result cannot exist without an attempt."_ `07 §16` allows `IN_PROGRESS → INVALIDATED`. But `03 §76` and `05 §30` allow invalidation **after** the student has started — and by implication after submission and marking, since that is when a problem is usually discovered.

If a submitted, marked attempt is invalidated, its `Result` still exists. Nothing states whether the result is deleted (violating `07 §3.3` on destructive deletion and `07 §42 Invariant 11` on provenance), transitioned to a state that does not exist in `Result`'s enum, or left `FINAL` and silently excluded from reporting.

**Why implementation could diverge**

Class averages, pass rates, and question analytics all aggregate results. An invalidated attempt's result must be excluded from those aggregates but retained as evidence. With no state to express "retained but not counted", implementers will either delete it or leave it in the averages — both wrong.

**Recommended interpretation (recommendation only)**

Add `VOIDED` to the `Result` state enum, reached only when the underlying attempt becomes `INVALIDATED` or `CANCELLED`. `VOIDED` results are retained in full, are excluded from every aggregate and from student visibility, and remain visible to authorized staff with the invalidation reason attached. This preserves the 1:1 cardinality, the provenance invariant, and the archival-not-deletion rule simultaneously. Every analytics query must then filter on result state — a rule worth encoding once in a shared query layer rather than repeating (B17).

---

### A-12 — Exam sections: schema-only or user-facing?

**Severity:** MEDIUM · **ADR:** ADR-0029

**Location:** `06 §36`, `07 §8.2`, `04 §42`

**The gap**

`06 §36` says _"Even if the first release primarily uses one section, designing for sections gives us future flexibility."_ `07 §8.2` models `ExamSection` with title, sequence, instructions, and marks, noting _"A simple exam may have one implicit/default section."_ No screen in `04` shows section management, and no functional requirement in `05` describes creating one.

**Why implementation could diverge**

"Implicit/default section" is doing a lot of work: does every exam get a real default section row, or is `exam_section_id` nullable on `ExamQuestion`? The first is cleaner and avoids a nullable foreign key on a hot table; the second is less machinery. The frontend question is whether F11's exam builder needs section UI at all.

**Recommended interpretation (recommendation only)**

Model `ExamSection` per `07 §8.2` and always create one default section per exam, so `ExamQuestion.exam_section_id` is non-nullable and the future feature needs no migration. Ship **no section UI** in the initial release — the builder creates the default section invisibly. Record multi-section authoring as an approved-but-deferred item.

---

### A-13 — Printable and PDF reporting

**Severity:** LOW · **ADR:** ADR-0030

**Location:** `02` ("Generate printable reports"), `01 §25`, `04 §51`

**The gap**

`02`'s matrix grants "Generate printable reports" to five roles, and to Student as "Own result if enabled". `01 §25` lists PDF as "potentially later". `05` specifies CSV in detail (`§54`) and never mentions PDF.

**Why implementation could diverge**

Browser print stylesheets versus server-side PDF generation are very different amounts of work, and the latter needs a rendering dependency, a worker queue, and object storage for the artefacts.

**Recommended interpretation (recommendation only)**

Browser print stylesheets for the initial release, satisfying "printable" without a PDF pipeline. Server-rendered PDF deferred. CSV remains the specified export format per `05 §54`.

---

### A-14 — Who moves an exam to `CLOSED` and `COMPLETED`, and when?

**Severity:** MEDIUM · **ADR:** folded into ADR-0004

**Location:** `07 §14`, `03 §41`, `05 §42`, `06 §42`

**The gap**

`07 §14`'s exam state machine shows `OPEN → CLOSED → COMPLETED` but attributes the transitions to no actor and no trigger. `03 §41` describes "End Examination" as a teacher action that checks `In Progress: 0` first. `05 §42` shows the same flow with a prompt to mark non-participants absent.

Unstated: whether `COMPLETED` requires zero in-progress attempts (`03 §41` implies a check but not a hard gate), what happens if a teacher never ends the exam, and how `Exam.status` relates to its sessions' statuses — `06 §42` notes _"The exam itself can remain OPEN across multiple sessions"_, so closing a session clearly does not close the exam, but the converse is unspecified.

**Why implementation could diverge**

Exams left `OPEN` indefinitely keep appearing in students' available-assessment lists and keep the Control Center live. Some automatic closure or staleness handling is needed, or schools will accumulate permanently-open exams.

**Recommended interpretation (recommendation only)**

`COMPLETED` requires zero `IN_PROGRESS` attempts and is an explicit, audited operator action (`EXAM_COMPLETED`), never automatic — it is the moment absences are confirmed, which must be deliberate. `CLOSED` is operator-driven and reversible. Add a background staleness check that flags exams `OPEN` with no activity beyond a threshold to the Control Center and to the School Admin dashboard's operational alerts (`04 §12`), rather than closing them automatically.

---

### A-15 — Which `marks` value is authoritative?

**Severity:** HIGH · **ADR:** none required; settle in B11

**Location:** `07 §7.2` (`QuestionRevision.marks`), `07 §8.3` (`ExamQuestion.marks`), `07 §9.2` (`marks_snapshot`), `07 §8.2` (`ExamSection.marks`)

**The gap**

Four entities carry a marks value. `07 §7.2` puts `marks` on the question revision; `07 §8.3` puts `marks` on `ExamQuestion`; `07 §9.2` snapshots `marks_snapshot`; `07 §8.2` gives `ExamSection` a `marks` too. No document states precedence.

**Why implementation could diverge**

If `ExamQuestion.marks` may differ from the revision's, a teacher can reweight an approved question for a specific exam — plausible and useful, but it means the approved revision's marks are only a default, which weakens the "approved content is immutable" story in a way no document acknowledges. If it may not differ, the column is redundant. `ExamSection.marks` is more puzzling still: a section total that could disagree with the sum of its questions.

**Recommended interpretation (recommendation only)**

`ExamQuestion.marks` is authoritative for the exam, defaulting from `QuestionRevision.marks` at selection time, and is snapshotted per attempt — reweighting is permitted while the exam is `DRAFT` and locked at `READY`. `ExamSection.marks` should be **derived** (the sum of its questions) rather than stored, or dropped; a stored value that can disagree with its own children is a defect waiting to happen. `Result.total_marks` is the sum of `marks_snapshot` across the attempt's snapshots, which makes it correct even if the exam is later archived.

---

### A-16 — Topic and subtopic: entities or free text?

**Severity:** MEDIUM · **ADR:** folded into ADR-0001

**Location:** `06 §31` (explicitly deferred), `07 §7.2`, `05 §52`, `04 §50`

**The gap**

`06 §31` defers the decision in as many words: _"Whether Topic/Subtopic become first-class entities or remain metadata can be decided later."_ But `04 §50` and `05 §52` both build on topic as a reporting dimension — clicking a question in the analytics view shows `Topic: Quadratic Equations` and groups performance by it.

**Why implementation could diverge**

Free-text topics make the analytics dimension unreliable ("Quadratic Equations", "quadratic equations", "Quadratics" become three topics) and make the question-bank filter in `04 §38` useless at scale. First-class topic entities require management UI, per-subject scoping, and a migration path for imported questions whose topic column is free text (`05 §18.1`'s import template has a plain `Topic` field).

**Recommended interpretation (recommendation only)**

First-class `Topic` entities scoped to (school, subject), with imports resolving topic names case-insensitively and auto-creating on first use so the import template stays unchanged. Subtopic as a nullable self-reference on `Topic`. This preserves the deferred flexibility while making the analytics dimension trustworthy, and it costs little if decided now rather than after 50,000 free-text questions exist.

---

### A-17 — Import file formats, limits, and template versioning

**Severity:** MEDIUM · **ADR:** none required; settle in B7

**Location:** `03 §15`, `05 §10`, `05 §18`, `01 §7`, `01 §42`

**The gap**

Import is specified as a first-class feature with a clear validate-preview-confirm pipeline (`05 §10.1`), and the validation rules are well enumerated. Unspecified: accepted formats (CSV and Excel are both mentioned; `.xlsx` needs a parsing dependency), maximum file size and row count, encoding expectations, how a 1,500-row import is processed (synchronously or via BullMQ — `08 §14` says bulk imports are background work, but `05 §10.1` shows an interactive preview), how long a validated-but-unconfirmed import is held, and whether templates are versioned.

**Why implementation could diverge**

The interactive preview in `05 §10.1` and the background processing in `08 §14` need reconciling: the natural design is background validation producing a stored report, then an interactive confirm that triggers background import. Without stating it, someone will build a synchronous import that times out on 1,500 rows.

**Recommended interpretation (recommendation only)**

CSV as the required format with `.xlsx` accepted via a parsing library; a documented row limit (suggested 5,000 per file) and file-size cap; upload → background validation job → stored validation report → interactive review → confirm → background import job, with the staged upload expiring after a defined window. Templates carry a version header so future changes can be detected and rejected with a clear message rather than misparsed.

---

### A-18 — "One-time" branding colour

**Severity:** MEDIUM · **ADR:** none required; settle in B4

**Location:** `02` (matrix, "Set primary colour": School Admin **Full / One-time**), `03 §5`, `05 §6.1`

**The gap**

The matrix cell reads `Full / One-time`, which is self-contradictory. `03 §5` says _"Once established, School Admin can change branding only through the permitted configuration flow"_ without defining that flow. `05 §6.1` treats branding as an ordinary settings screen with logo replacement and colour change, and explicitly notes changing either does not affect historical reports.

**Why implementation could diverge**

Either the colour is set once at onboarding and thereafter requires Software Admin involvement, or it is an ordinary editable setting. `05 §6.1` and `04 §19` both suggest the latter.

**Recommended interpretation (recommendation only)**

Freely editable by School Admin through the branding settings screen, audited on change (`SCHOOL_BRANDING_CHANGED`). Read `Full / One-time` as describing the _onboarding wizard step_ being one-time, not the capability. `05 §6.1`'s note that branding changes do not affect historical reports already covers the integrity concern.

---

## 6. Section D — Missing Requirements

Behaviour the product or architecture lifecycle requires, which the documentation does not adequately represent. These are gaps rather than conflicts: nothing contradicts them, but nothing specifies them either.

---

### M-01 — No entity resolves an HOD's review scope to a set of subjects

**Severity:** BLOCKER · **ADR:** ADR-0001 · **Roadmap:** B5, B9

The counterpart of `C-04`. `07 §41` states the HOD authorization rule as `HODAssignment + Department scope`, but there is no relation from `Department` to `Subject`, and `Question` attaches to `Subject`. The HOD review queue — `04 §29`'s most prominent action, showing _"27 Questions Awaiting Review: Mathematics 11, Physics 7, Chemistry 5, Biology 4"_ — has no query behind it. Resolution is part of ADR-0001.

---

### M-02 — Student subject registration is not modelled

**Severity:** BLOCKER · **ADR:** ADR-0011 · **Roadmap:** B6, B11

`03 §31` and `05 §26` both include _"Eligible for subject?"_ in the exam-eligibility check. But a student's relationship to subjects is only ever expressed through their class: `StudentEnrollment → ClassGroup`, and `ClassSubject` says which subjects a class is offered.

That is sufficient only if **every student in a class takes every subject offered to it**. Nigerian senior secondary classes routinely do not work that way: an SS2 Science class typically has students taking Further Mathematics and students who do not, and Civic Education or a trade subject may be split across a class. With no `StudentSubjectRegistration`, an exam for an elective becomes visible to, and startable by, students who do not take it — and they would then be marked `ABSENT` for a subject they never study, which corrupts participation reporting and any subject-level analytics.

`01 §31` and `03 §9` both discuss subjects grouped by department, and `06 §19` introduces `ClassSubject` as "the basis for teacher assignments **and exam eligibility**" — which is precisely the assumption that breaks for electives.

**Recommended interpretation (recommendation only)**

Model `StudentSubjectRegistration` (student enrollment × class subject, with status), defaulting to auto-registering every student in a class for every `ClassSubject` at enrollment so the simple case needs no extra work, and allowing the Moderator to deregister students from electives. Exam eligibility then checks registration rather than class membership. If this is deferred, the platform cannot correctly administer elective subjects, which should be stated explicitly rather than discovered by a school.

---

### M-03 — An exam belongs to exactly one class

**Severity:** HIGH · **ADR:** ADR-0013 · **Roadmap:** B11

`07 §8.1` gives `Exam` a single `class_id`. `03 §83`'s worked example creates _"SS2A Mathematics First Term Examination"_ for one arm.

A school with SS2A, SS2B, and SS2C sitting the same Mathematics paper must therefore create three separate exams with the same questions — which fragments the very reporting the platform exists to produce (`03 §80`'s "show Ahmed Bello's Mathematics result from First Term 2026/2027" works, but "show the SS2 Mathematics distribution" now spans three exam records), triples the readiness checks, and triples the Control Center screens the teacher must run during a single sitting.

This also sits oddly beside the platform's own strongest design decision: `06 §73` and `06 §79` argue at length that one exam must serve multiple batches rather than fragmenting into `Batch 1` / `Batch 2` exams. The same argument applies to arms of the same level.

**Recommended interpretation (recommendation only)**

Allow an exam to target multiple classes through an `ExamClass` join, keeping `Exam` otherwise unchanged. Eligibility then resolves through any targeted class. This is a small model change now and an invasive one later, because `Exam.class_id` will be referenced across results, analytics, and every scope check. If single-class is confirmed as correct, record it as a deliberate decision with its reporting consequence acknowledged.

---

### M-04 — No authorization entity for exceptional reattempts

**Severity:** HIGH · **ADR:** ADR-0014 · **Roadmap:** B16

See `C-11`. The capability is specified in `03 §45`, `03 §75`, and `05`'s edge-case matrix; `07 §9.1` provides the `RETRY` attempt type; nothing authorizes it.

---

### M-05 — No request/approval subsystem

**Severity:** MEDIUM · **ADR:** ADR-0017 · **Roadmap:** B6, B9

See `C-10`. Four permission cells reference request/approve semantics with no supporting model, screen, or state machine.

---

### M-06 — Grading scale has no entity, owner, or versioning

**Severity:** HIGH · **ADR:** ADR-0018 · **Roadmap:** B15

`05 §46` requires school-configurable grading and is explicit that the default Nigerian scale must not be hard-coded: _"School Admin should define grading policies where necessary. The raw marks + percentage must always remain available."_ `07 §10.1` gives `Result` a `grade` field. `04 §19` lists grading under School Settings.

Missing entirely: a `GradingScale` entity, its bands, which entity owns it (school, session, class level, or subject — a JSS scale often differs from an SS scale), and — most importantly — **what happens to historical results when the scale changes**. If grades are stored on `Result` (as `07 §10.1` implies) they are frozen correctly, but a school editing its scale mid-session will produce two cohorts graded differently with nothing recording why. If grades are computed on read, changing the scale silently rewrites history, violating `07 §42 Invariant 13`.

**Recommended interpretation (recommendation only)**

A versioned `GradingScale` owned by the school with optional level scoping; `Result.grade` stored at finalisation together with the `grading_scale_version_id` used. Editing a scale creates a new version rather than mutating bands. Raw marks and percentage remain authoritative per `05 §46`, so any historical regrade is a reporting choice rather than a data rewrite.

---

### M-07 — No transactional messaging channel

**Severity:** BLOCKER · **ADR:** ADR-0019 · **Roadmap:** B1, B3

The product depends on out-of-band delivery in at least six places, and no document specifies a channel, provider, or template set:

- `03 §3` — the School Admin _"receives the activation key/invitation"_. By what means?
- `03 §11` — a Moderator receives _"Temporary credential/invitation"_.
- `04 §2` — the login screen has _"Forgot password?"_. Delivered how?
- `05 §4.2` — _"Before expiration: Admin warning, School notification, Platform notification"_.
- `04 §64` / `06 §64` — the notification system is specified as in-app only.
- `09` — the stack table has no email or SMS provider row at all.

**Why it is a BLOCKER**

School onboarding (B3) cannot complete without delivering an activation key to a School Admin who has no account yet, and password reset (B1) cannot work without a delivery channel. In the Nigerian secondary-school context, SMS is often more reliable than email for staff, and students may have neither — which is why `A-02` recommends printed credential sheets for students and a messaging channel only for staff.

**Recommended interpretation (recommendation only)**

Adopt a transactional email provider for staff-facing flows (invitation, password reset, subscription warnings) behind a `NotificationChannel` abstraction so SMS can be added without touching call sites; keep student credential distribution offline via printable sheets. Record the provider choice, sender-domain and deliverability setup (SPF/DKIM/DMARC), and template inventory in the ADR.

---

### M-08 — Integrity/proctoring signals have no model

**Severity:** HIGH · **ADR:** ADR-0020 · **Roadmap:** B13

`03 §78` specifies an anti-cheating foundation for the core product: fullscreen mode where supported, tab and window-change monitoring, warning events, administrative visibility, and audit trail — with the important caveat that these are _"controls, not evidence of cheating by themselves"_ and must be recorded as events rather than accusations. `05 §73` requires the Control Center to surface _"1 student has experienced repeated exam-window exits."_ `08 §17` restates that signals _"are recorded as events and should not automatically be treated as proof of misconduct."_

No entity models these events. `07`'s Execution domain has no `AttemptEvent`, and `07 §11.1`'s `AuditEvent` is school-administrative, not per-attempt telemetry — routing thousands of per-attempt focus events into the audit table would swamp it.

**Recommended interpretation (recommendation only)**

An `AttemptEvent` entity (attempt, type, occurred_at, client-reported metadata) with types covering `WINDOW_BLUR`, `FULLSCREEN_EXIT`, `RECONNECTED`, `TAB_HIDDEN`, `RESUMED`. Written on the non-critical path so it never blocks answer saves, explicitly labelled client-reported (and therefore untrusted), retained with the attempt, and surfaced in the Control Center as counts rather than judgements. This also gives `M-09` its home.

---

### M-09 — No attempt liveness signal, so "disconnected" is not detectable

**Severity:** HIGH · **ADR:** ADR-0020 · **Roadmap:** B12, B13

`05 §73` requires the Control Center to warn _"2 students are disconnected."_ `04 §46`'s live attempt table shows a per-student `Status` column. But `ExamAttempt` (`07 §9.1`) records only `started_at`, `expires_at`, and `submitted_at` — there is no last-seen timestamp, so an attempt that is genuinely abandoned is indistinguishable from one being worked on quietly.

This also underpins `X-01`: without liveness, the system cannot tell an in-progress attempt from an abandoned one when deciding what to auto-submit.

**Recommended interpretation (recommendation only)**

A `last_seen_at` on `ExamAttempt`, updated by answer saves and by a lightweight heartbeat while the attempt is open (heartbeat interval chosen against B21 load results — it multiplies by concurrent attempts). "Disconnected" is then derived as `last_seen_at` older than a threshold. The heartbeat must be cheap and must never be on the critical path of an answer write.

---

### M-10 — Session rollover mechanics are undefined

**Severity:** MEDIUM · **ADR:** ADR-0026 · **Roadmap:** B19

`03 §60`–`§63` and `01 §35` specify the promotion workflow well at the product level: generate candidates, review exceptions, confirm. What is not specified is what rollover actually does to the academic structure.

`ClassGroup` is session-scoped (`07 §6.4`), so `SS2A 2027/2028` is a new row. `ClassSubject` is session-scoped. `TeacherAssignment` is session-scoped. So starting a new session requires recreating the class structure, the subject offerings, and the teacher assignments. `03 §64` acknowledges the teacher part (_"At the new session: Review teacher assignments"_) but no document says whether classes and offerings are copied forward automatically, recreated manually, or selectively cloned.

For a school with 31 classes and 42 subjects (`04 §12`'s example), manual recreation every year is a serious usability failure that would show up in year two of production — after the first cohort of customers has already renewed.

**Recommended interpretation (recommendation only)**

A session-rollover wizard that clones the previous session's classes, class-subject offerings, and optionally teacher assignments into the new session as editable drafts, then runs promotion against the cloned structure. Everything reviewable before commit, per `03 §61`'s insistence that promotion is never an instant mass update. The whole rollover runs in one transaction with an audit event per decision.

---

### M-11 — Assignment carry-forward across sessions

**Severity:** MEDIUM · **ADR:** ADR-0026 · **Roadmap:** B19

`03 §64` states teachers _"should not automatically retain every assignment forever"_ and shows a review step; `03 §65` says the same for HODs. Neither says what the default is — carry forward and let the school prune, or start empty and let the school assign. The first risks a teacher retaining access they should have lost; the second means a school with 87 teachers reassigns everything each August. Folded into ADR-0026.

---

### M-12 — No timezone policy

**Severity:** HIGH · **ADR:** ADR-0027 · **Roadmap:** B0

Timestamps are load-bearing throughout: `started_at`, `expires_at`, `submitted_at`, session start and end dates, term boundaries, subscription expiry. No document states a timezone policy. The initial market is Nigeria (WAT, UTC+1, no DST), but the platform is multi-tenant and commercial, and `01 §9` of the platform analytics section already contemplates "usage by region".

The exam engine is the sharp edge: `expires_at` must be computed and compared in a single unambiguous frame, and a student's displayed countdown must derive from the server's expiry rather than from local device time (`08 §11.4`, `09 §7`).

**Recommended interpretation (recommendation only)**

Store every timestamp as UTC (`timestamptz`); give `School` a configurable IANA timezone defaulting to `Africa/Lagos`; render all school-facing times in the school's zone; never send or accept a naive local timestamp across the API. Add a per-school timezone to the school profile in B3 rather than retrofitting it once schools exist in more than one zone.

---

### M-13 — No data-protection posture

**Severity:** MEDIUM · **ADR:** ADR-0028 · **Roadmap:** B20

The platform stores personal data about **minors** at scale — names, admission numbers, class placement, and complete academic performance histories — for Nigerian schools, which brings the Nigeria Data Protection Act and NDPR into scope. No document mentions data protection, lawful basis, subject-access requests, breach notification, or a data-processing agreement with customer schools.

`08 §16` covers security controls well (hashing, sessions, rate limiting, encryption, least privilege) but security controls and a data-protection posture are different things, and the latter is a commercial prerequisite: schools will ask for a DPA before signing.

**Recommended interpretation (recommendation only)**

Treat this as a pre-launch legal and product workstream in B20, not an engineering afterthought: document the processor/controller relationship (the school is controller, the platform is processor), define subject-access and deletion request handling in a way that respects `07 §42 Invariant 14`'s prohibition on destroying academic records, and produce a standard DPA. Engineering consequences to confirm early: data residency expectations (which feeds ADR-0032's region choice) and audit-log retention.

---

### M-14 — No retention schedule

**Severity:** MEDIUM · **ADR:** ADR-0028 · **Roadmap:** B20

`07 §3.3` says hard deletion should be limited to _"data explicitly covered by a future retention policy"_ — a forward reference to a policy that does not exist. `03 §80` implies indefinite retention (_"What exists after 5 years?"_), and `08 §21` requires backup retention targets to be defined before launch.

Unspecified: how long attempt-level evidence (`AttemptAnswer`, `AttemptQuestionSnapshot`) is retained versus results, what happens to a school's data after `DEACTIVATED`, and whether there is an export-and-purge path for a departing customer. The snapshot and answer tables are the largest in the system (`R-05`), so retention is a cost question as well as a legal one.

---

### M-15 — "Exam Operator" capability has no implementation model

**Severity:** MEDIUM · **ADR:** folded into ADR-0012 · **Roadmap:** B2, B12

`01 §12` (second half) and `02 §10` both reject a permanent Invigilator role in favour of a capability: _"a School Admin could designate Mr. Ade → Mathematics Teacher + Exam Operator... So later our permission system can distinguish Role from Assigned capabilities."_

`02 §11` reinforces it by distinguishing an exam's `Created by`, `Owned by`, and `Administered by`, with the worked example showing an exam created by Mr Ade but administered by Mrs Bola.

Neither `06` nor `07` models a capability, and `Exam` (`07 §8.1`) has only `created_by` — no `administered_by`. So the documented case of one teacher running another teacher's exam cannot be expressed, and the Control Center permission ("Teacher: Full own exam") locks out the person actually invigilating.

**Recommended interpretation (recommendation only)**

Add `ExamAdministrator` (exam × user, assigned_by, status) so administration rights can be delegated per exam without inventing a role, and treat "own exam" in the permission matrix as `created_by OR is an active ExamAdministrator`. A general capability system is not needed for the initial release; this one delegation covers every case the documents actually describe.

---

### M-16 — No idempotency key format or canonical API error contract

**Severity:** HIGH · **ADR:** ADR-0033 · **Roadmap:** B0, B13

`08 §3` requires that _"submission, answer sync, imports, result generation, and administrative commands must tolerate retries"_, and `08 §11.2` requires the client to synchronise pending changes _"using idempotent operation identifiers"_. `09 §16` notes BullMQ supports job deduplication.

Nothing specifies the identifier's format, where it travels (header or body), how long the server remembers it, what a replay returns, or what happens when the same key arrives with a different payload. Likewise, no document defines the API error contract — yet `08 §12.3` requires reconciliation to be _"deterministic"_, and _"A client must never assume that a queued operation succeeded merely because it was sent"_, which is only implementable if the client can distinguish a retryable failure from a permanent rejection.

**Why it matters**

The offline client's correctness rests entirely on this. Without a defined contract, the client cannot tell "your answer was rejected because the attempt expired" (drop it, inform the student) from "the request failed, try again" (keep it queued). Getting this wrong loses answers or replays them forever.

**Recommended interpretation (recommendation only)**

Client-generated UUIDv7 per operation, sent in an `Idempotency-Key` header, stored server-side with the response for a bounded window; a replay with the same key returns the original response, and the same key with a different payload is a hard error. A single structured error envelope carrying a stable machine-readable code, an HTTP status, and a `retryable` boolean, published in the OpenAPI document so the offline client can branch on it. Define both in B0 before any endpoint is written.

---

### M-17 — Role-aware search has no specification

**Severity:** MEDIUM · **ADR:** none required · **Roadmap:** B18

`04 §65` specifies role-aware search across students, teachers, classes, exams, questions, and department results, with a different corpus per role and none at all for students. No document specifies the mechanism, scope enforcement, or ranking.

The scope enforcement is the risk: a search that queries across entity types is exactly where a tenant or academic-scope leak is most likely, because the filter must be reapplied per corpus. `08 §8` requires school context on every scoped query, and a search implementation that assembles results from several sources can easily miss one.

**Recommended interpretation (recommendation only)**

PostgreSQL full-text search for the initial release — no additional search infrastructure — with a single shared scope-resolution layer applied per corpus and a dedicated tenant-isolation test per searchable entity type (B18, cross-referenced from B22's security testing).

---

## 7. Section E — Architectural Risks

Requirements that may be difficult, expensive, or risky to implement as specified.

---

### R-01 — Tenant isolation rests entirely on application-layer discipline

**Severity:** HIGH · **ADR:** ADR-0023 · **Roadmap:** B0, B2, B22

`08 §7.2` requires that _"Foreign keys and application-level authorization must both enforce tenant boundaries."_ Foreign keys enforce _referential_ integrity, not _tenant_ integrity: a foreign key from `Exam.class_id` to `ClassGroup.class_id` does not prevent School A's exam referencing School B's class unless a composite constraint carries `school_id` on both sides.

So in practice every cross-tenant guarantee depends on every query carrying the right `school_id` — across an application with roughly 15 modules, background workers (`08 §8`), exports, cache keys, and object-storage paths. One missing filter in one reporting query is a cross-tenant data leak in a product whose primary promise is isolation (`A-C4`), and `AGENTS.md §6` states the requirement in absolute terms.

**Recommended mitigation**

Three layers rather than one: (1) composite foreign keys including `school_id` wherever a school-owned entity references another, so the database rejects cross-tenant references outright; (2) PostgreSQL Row-Level Security with a session-scoped tenant variable as defence in depth — this is the ADR-0023 decision, and it is far cheaper to adopt at B0 than to retrofit; (3) an automated test suite that, for every school-scoped endpoint, asserts a School A actor receives 404 for a School B resource (B22), generated from the route table so new endpoints cannot silently skip it.

---

### R-02 — Cross-origin session strategy is unresolved and blocks the foundation

**Severity:** BLOCKER · **ADR:** ADR-0022 · **Roadmap:** B0, B1

`09 §28` places the Next.js web application on Vercel and the NestJS API on AWS — two different origins. `09 §24` specifies browser authentication using _"HttpOnly, Secure, SameSite-appropriate, Rotatable"_ sessions.

`SameSite-appropriate` is where the difficulty hides. A cookie set by an AWS API host and sent from a Vercel-hosted origin is a cross-site cookie requiring `SameSite=None; Secure`, which brings CSRF exposure and increasingly aggressive browser restrictions on third-party cookies. The alternatives each have consequences: put both behind one apex domain via subdomains (`app.school.example` and `api.school.example`, making cookies same-site) — which interacts directly with ADR-0005's per-school subdomain decision; proxy API calls through Next.js route handlers (adds a hop and undermines `09 §29`'s reasoning for keeping the API off serverless); or use bearer tokens in memory (loses HttpOnly protection and complicates refresh for a client that must survive page refresh mid-exam, per `05 §36`).

**Why it is a BLOCKER**

The student CBT client must survive a page refresh mid-attempt with its session intact — this is a hard requirement (`03 §36`, `05 §36`). The chosen mechanism determines the auth module, the CSRF posture, the DNS and TLS plan, and the offline client's token handling. Building B1 on the wrong choice means rewriting authentication after the exam client already depends on it.

**Recommended mitigation**

Decide alongside ADR-0005, since per-school subdomains and API origin placement are the same DNS decision. The audit's preference is a shared parent domain with the API on a sibling subdomain, giving genuinely same-site HttpOnly cookies and preserving `09 §29`'s long-running API tier.

---

### R-03 — Answer-write pressure concentrates on a single PostgreSQL primary

**Severity:** HIGH · **ADR:** none required · **Roadmap:** B21

`08 §20` gives the load model as `concurrent active attempts × answer-save frequency × average payload size`, and `09 §40` requires testing to 1,000 concurrent attempts. `09 §17` correctly forbids routing answer saves through BullMQ, so every answer write is a synchronous transaction against the primary.

At 1,000 concurrent students saving every 10 seconds, that is ~100 write transactions per second sustained for an hour, plus heartbeats (`M-09`), plus snapshot reads, plus the Control Center's live queries polling the same tables. Well within PostgreSQL's capability on adequate hardware, but only with correct indexing, short transactions, connection pooling sized to the instance, and no accidental table scans on `AttemptAnswer`.

The specific hazards: connection exhaustion from Fargate tasks each holding a Prisma pool (`09 §31` scales tasks horizontally, and each task's pool multiplies); lock contention if answer writes touch the parent `ExamAttempt` row; and the Control Center's per-student time-remaining query (`04 §46`) running against live attempt rows for every connected teacher.

**Recommended mitigation**

Answer writes must touch only `AttemptAnswer` and never update the parent attempt row (which means `last_seen_at` from `M-09` needs care — a separate lightweight table or a deliberately unlogged pattern). Introduce a connection pooler (PgBouncer or RDS Proxy) before B21 rather than after. Derive Control Center counters from cached aggregates refreshed on a short interval rather than querying live rows per teacher. Validate all of it in B21 at each specified level (20, 100, 500, 1,000).

---

### R-04 — SSE fan-out across multiple stateless API nodes

**Severity:** MEDIUM · **ADR:** none required · **Roadmap:** B12, B21

`09 §21` specifies SSE for the Control Center with fan-out via Redis pub/sub, which is the right shape. Two operational details are unaddressed: each SSE connection holds an open HTTP connection for the duration of an exam sitting (potentially an hour), so a school with many simultaneous invigilated exams holds many long-lived connections per Fargate task and against the load balancer's idle timeout; and `08 §6` requires application instances to hold no essential state, so a node restart during deployment drops every SSE stream, requiring client-side reconnection with replay.

**Recommended mitigation**

Set explicit ALB idle timeouts above the expected stream duration; implement client reconnection with `Last-Event-ID` and a server-side replay buffer in Redis; treat SSE as an enhancement over a polling fallback so a dropped stream degrades rather than breaks the Control Center. Include SSE connection count in the B21 load model — it is easy to omit and it is the resource that runs out first.

---

### R-05 — Snapshot storage volume

**Severity:** HIGH · **ADR:** ADR-0008 · **Roadmap:** B13, B21

`07 §9.2` requires one `AttemptQuestionSnapshot` per question per attempt, each carrying full content, options, correct answer, and marks. A 40-question exam for 1,200 students is 48,000 snapshot rows with duplicated content for one exam. `04 §12`'s example school runs 47 exams a term; `01 §6`'s platform view contemplates 4.8M attempts.

Content duplication is intentional and correct — `06 §74` and `A-C14` establish why — but the volume compounds: snapshots plus `AttemptAnswer` plus `AttemptQuestionResult` become the largest tables in the system by a wide margin, and they grow monotonically because `07 §40` forbids deletion.

**Recommended mitigation**

Decide the storage shape at ADR-0008 with this in mind. The audit leans toward one JSONB snapshot document per attempt rather than per-question rows: it matches the access pattern exactly (the client fetches the whole attempt package at once, per `08 §11.1`), reduces row count by the question count, and compresses well. The tradeoff is that per-question SQL analytics must then read through JSONB — which is acceptable because `AttemptQuestionResult` (which stays relational) is what analytics actually aggregates. Whichever shape is chosen, pair it with a partitioning or archival strategy decided alongside `M-14`, and measure real storage growth in B21.

---

### R-06 — Private question media conflicts with offline execution

**Severity:** HIGH · **ADR:** ADR-0021 · **Roadmap:** B4, B13

`09 §22` requires question media in a private bucket with _"short-lived authorized access"_, and `09 §34` is emphatic: _"We should never simply put `/question-images/exam-question-17.jpg` on a public URL during a live examination."_

`08 §12.1` simultaneously requires that a student can _"read already-authorized question snapshots"_ while offline. These pull in opposite directions: a short-lived signed URL expires, and a student who goes offline for twenty minutes returns to broken images in a Biology or Geography paper where the diagram _is_ the question. `01 §43` establishes that images, diagrams, and equations are essential for Nigerian secondary-school papers, so this is not an edge case.

**Recommended mitigation**

Fetch and cache media into the browser's storage (Cache Storage via the service worker, per `09 §10`) as part of the attempt package download at start, while the student is definitionally online — so offline reads hit the local cache rather than the network. Signed URLs then only need to outlive the initial download. Requires the start flow to report media-download progress and to block "Start" until essential media is cached, which is a real UI requirement for F13 and should be specified there. Also bounds the attempt package size, which interacts with `R-10`.

---

### R-07 — Prisma and the locking the exam engine needs

**Severity:** MEDIUM · **ADR:** none required · **Roadmap:** B13

`09 §13` selects Prisma 8 while acknowledging the concern directly: _"Our exam engine will sometimes need very deliberate SQL operations, for example `SELECT ... FOR UPDATE`... We should not force every query through ORM abstractions."_

The start-attempt and submit transactions both need row-level locking to prevent the races in `X-03` and `X-07`. Prisma's typed API does not express `FOR UPDATE`, so these paths use `$queryRaw` inside an interactive transaction — losing type safety exactly where correctness matters most, and where a mistake is a duplicate attempt or a double-marked submission.

**Recommended mitigation**

Confine raw SQL to a small, explicitly-named set of exam-engine repository methods with hand-written types and unusually thorough tests, rather than letting raw queries spread. Prefer unique constraints over locks where a constraint can express the invariant (a partial unique index on active attempts per student per exam prevents duplicate starts without any lock — see `X-03`), because a constraint cannot be forgotten by a future code path. Reserve `FOR UPDATE` for the submit transition where a constraint cannot express the rule.

---

### R-08 — Region selection is unspecified, and latency to Nigeria is a product concern

**Severity:** HIGH · **ADR:** ADR-0032 · **Roadmap:** B0, B21

`09` selects AWS for the API, database, and Redis, and Vercel for the web tier, but names no region. For schools in Nigeria the realistic options differ materially: `af-south-1` (Cape Town) is closest but has a smaller service catalogue and different pricing; `eu-west-1` (Ireland) is the common choice for West African traffic with roughly 80–150 ms RTT; `eu-west-2` or `eu-central-1` are comparable.

Latency lands directly on the product's hot path. Every answer save is a round trip (`09 §45`), and `08 §20`'s write-pressure model assumes those complete quickly. On a congested school network with 150 ms base RTT, a save-per-answer-change design feels sluggish and increases the window in which an answer is unsynchronised when connectivity drops.

**Recommended mitigation**

Choose the region explicitly with measured RTT from representative Nigerian networks rather than from theory, and design the client to batch and debounce answer writes so perceived responsiveness does not depend on RTT — the local IndexedDB write is what the student sees, and the network write is asynchronous confirmation (`08 §12.1` already permits exactly this). Confirm both in B21 under simulated latency and packet loss, not just under clean-network load.

---

### R-09 — No CDN or bandwidth strategy for school labs

**Severity:** MEDIUM · **ADR:** ADR-0032 · **Roadmap:** B21, B23

`09 §34` addresses CDN for logos and static assets but not for the realistic constraint: a computer lab where 20–40 machines simultaneously load the application shell and an exam package over one shared, often metered connection. `01 §10` names the environment precisely — unstable electricity, unstable internet, shared labs, old computers, network congestion.

**Recommended mitigation**

Aggressive service-worker precaching of the application shell (already in scope per `09 §10`) so a second sitting on the same machine loads from cache; measure and budget the attempt-package payload including media (`R-06`); test the realistic burst — 40 clients starting within 60 seconds on a constrained link — in B21. Consider whether the shell should be installable ahead of exam day as an explicit school preparation step, which would be a documentation deliverable in B23.

---

### R-10 — Old lab hardware and browser baseline

**Severity:** LOW · **ADR:** none required · **Roadmap:** B13, B23

`01 §10` names _"old computers"_ as a design constraint. The stack assumes IndexedDB, service workers, and a modern React runtime (`09 §5`–`§10`). No document states a minimum browser or hardware baseline, yet the CBT client is the piece that must run on whatever the lab has.

**Recommended mitigation**

Declare a supported browser matrix early (B13), test the exam client on a low-end machine as an explicit acceptance step, keep the exam bundle small and avoid heavy runtime dependencies on that route, and provide a clear pre-flight compatibility check on the assessment preview screen (`04 §54`) so an unsupported machine is discovered before a student starts rather than mid-attempt.

---

### R-11 — The technology baseline needs re-validation

**Severity:** HIGH · **ADR:** ADR-0031 · **Roadmap:** B0

`09` pins specific versions — Node 24 LTS, NestJS 11, Next.js 16.3, PostgreSQL 18.6, Prisma 8 — as current _"as of August 2026"_, and `CLAUDE.md` requires that _"Technology choices must still be validated during implementation where specific versions, infrastructure capabilities, or constraints have changed."_

Several of these carry real coupling risk: NestJS + Fastify adapter compatibility at the chosen majors, Prisma's PostgreSQL 18 support and its transaction/isolation API surface, `@nestjs/bullmq` against the deployed Redis-compatible service's version, and Next.js major-version behaviour on Vercel. A mismatch discovered at B13 is far more expensive than one discovered at B0.

**Recommended mitigation**

Make version validation an explicit B0 deliverable with a recorded compatibility matrix, and prove the risky combinations with a thin end-to-end spike (Nest+Fastify+Prisma+Postgres+BullMQ+Redis exercising one transaction and one queued job) before committing the foundation.

---

### R-12 — No load-shedding or graceful-degradation plan for a live exam

**Severity:** MEDIUM · **ADR:** none required · **Roadmap:** B21, B22

`08 §25` gives a good failure-handling table per component, and `09 §37` proposes an Exam Health Monitor alerting on falling answer-save success. Neither says what the system _does_ when saturated while 500 students are mid-exam. Under overload the correct behaviour is not uniform: answer saves and submissions must survive at the expense of analytics, exports, report generation, and even the Control Center's live stream.

**Recommended mitigation**

Define a priority tier for exam-execution endpoints and shed lower-priority load first — pause non-critical background queues, degrade SSE to polling, disable heavy reporting — when saturation indicators trip. Rehearse it in B21 rather than discovering the ordering during a real examination. The client's offline queue (`08 §12`) already provides the buffer that makes shedding survivable, which is a strong argument for exercising the two together.

---

## 8. Section F — Data-Model Risks

Risks in ownership, cardinality, state transitions, immutability, historical preservation, tenant isolation, and concurrency.

---

### D-01 — Tenant scoping requires denormalised `school_id` on deep tables

**Severity:** BLOCKER · **ADR:** ADR-0023 · **Roadmap:** B0

**Category:** tenant isolation

`07 §3.1` requires that school-owned entities carry _"a direct or derivable `school_id`"_. "Derivable" is where the risk sits. `AttemptAnswer` reaches its school through `Attempt → ExamSession → Exam → school_id` — four joins. `AttemptQuestionSnapshot` is similar. Yet these are the highest-volume tables, and every scoped query and every RLS policy would pay that join cost.

The decision — denormalise `school_id` onto deep execution tables, or derive it — must be made before the schema is written, because retrofitting a `school_id` onto tables holding tens of millions of rows is a painful migration. It also determines whether RLS (`R-01`) is practical: RLS policies that must join four levels to evaluate are too expensive for the hot path.

**Recommended mitigation**

Denormalise `school_id` onto every school-owned table including the execution tables, enforce it with composite foreign keys so it cannot drift from the parent's value, and make it the leading column of the primary indexes. This makes both RLS and ordinary scoped queries cheap and makes cross-tenant references structurally impossible rather than merely forbidden.

---

### D-02 — Academic scope is not expressible

**Severity:** BLOCKER · **ADR:** ADR-0001 · **Roadmap:** B5

**Category:** ownership

The data-model face of `C-04` and `M-01`: `Subject` has no department, `Question` has no level, so neither HOD review scope nor teacher question scope can be computed. Blocks the authorization engine and the question bank.

---

### D-03 — `Exam.class_id` is a single-value foreign key

**Severity:** HIGH · **ADR:** ADR-0013 · **Roadmap:** B11

**Category:** cardinality

The data-model face of `M-03`. Changing this later is invasive because `class_id` propagates into eligibility, results, analytics, and every scope check.

---

### D-04 — Duplicated status semantics between `School` and `Subscription`

**Severity:** HIGH · **ADR:** ADR-0016 · **Roadmap:** B3

**Category:** state transitions

The data-model face of `C-13`. Two fields able to express the same condition, with no stated precedence, consulted on the hot path of every request.

---

### D-05 — Snapshot shape is unspecified

**Severity:** MEDIUM · **ADR:** ADR-0008 · **Roadmap:** B13

**Category:** historical preservation, concurrency

`07 §9.2` lists snapshot attributes without committing to storage shape. Per-question rows versus one JSONB document per attempt have very different write profiles at attempt start: a 40-question exam is either 40 inserts or one, inside the start transaction, at the moment 20 students in a lab press Start within seconds of each other. The per-row shape makes the start transaction the most expensive write in the system. See `R-05`.

---

### D-06 — Answer history requirement is conditional and therefore undecided

**Severity:** HIGH · **ADR:** ADR-0007 · **Roadmap:** B13

**Category:** immutability

`07 §9.3`'s _"if audit-grade answer history is required"_ leaves the immutability requirement genuinely open for the single most evidentiary table in the product. `07 §38`'s immutable-data matrix lists `AttemptAnswer` as "Final submitted answer" immutable — which constrains the answer _after_ submission but says nothing about the mutation history _during_ the attempt. See `A-07`.

---

### D-07 — Participation is recorded in three places

**Severity:** HIGH · **ADR:** ADR-0024 · **Roadmap:** B16

**Category:** state transitions, historical preservation

Participation state exists on `ExamAttempt.participation_status` (`07 §9.1`), on the `ExamParticipation` entity (`07 §9.5`, declared _"the authoritative participation record"_), and implicitly in `ExamSessionParticipant.status` (`07 §8.5`, with values `AUTHORIZED / REVOKED / COMPLETED / CANCELLED`).

Three overlapping records with no stated synchronisation rule. `07 §9.5` names `ExamParticipation` authoritative, which makes `ExamAttempt.participation_status` a denormalised copy that can drift — and `06 §61` itself hedges, noting participation _"can be derived from session participant, attempt, and final status"_ before introducing the explicit entity anyway.

**Recommended mitigation**

Keep `ExamParticipation` as the single authority (per `07 §9.5`), remove `participation_status` from `ExamAttempt` or make it a generated projection, and define the roll-up per `A-05`. `ExamSessionParticipant.status` should describe _authorization_ only (`AUTHORIZED`, `REVOKED`), not participation outcome — `COMPLETED` on that entity duplicates attempt state and should be dropped.

---

### D-08 — `Result` 1:1 `Attempt` under invalidation and adjustment

**Severity:** HIGH · **ADR:** ADR-0025 · **Roadmap:** B15

**Category:** immutability, state transitions

The data-model face of `A-11`. Additionally, `07 §10.2`'s `ResultAdjustment` carries `old_value` and `new_value`, implying the parent `Result` row is mutated in place while the adjustment records the delta. That is defensible, but it means the "original finalized result" that `07 §38` lists as immutable is only reconstructable by replaying adjustments — which must be stated as the intended design, and tested, rather than assumed.

**Recommended mitigation**

State explicitly that `Result` holds current values while `ResultAdjustment` forms the append-only history, and require that replaying adjustments in order reproduces the original — with a test asserting it. Add the `VOIDED` state from `A-11`.

---

### D-09 — Concurrent attempt creation has no stated constraint

**Severity:** BLOCKER · **ADR:** none required; must be designed in B13 · **Roadmap:** B13

**Category:** concurrency

`07 §9.1` invariant 1 requires that a student cannot exceed the exam's attempt policy, and `07 §23` lists validations performed at start — but no document specifies a database constraint or locking strategy enforcing it. Application-level checking alone loses the race: two requests (a double-clicked Start button, or a page refresh during a slow start) both pass validation and both insert.

The consequence is severe and hard to repair: two `IN_PROGRESS` attempts for one student on one exam, two snapshot sets, answers split across both, and two results — violating `07 §42` invariants 8 and 11 simultaneously. `09 §48` flags concurrent attempt creation as one of three areas to be conservative about.

**Recommended mitigation**

A partial unique index guaranteeing at most one active attempt per (student, exam) — for example unique on `(student_profile_id, exam_id)` where `state = 'IN_PROGRESS'` — so the database rejects the second insert regardless of application logic. Combine with an idempotency key on the start request (`M-16`) so a retried start returns the existing attempt rather than an error. Test explicitly with simultaneous duplicate start requests (B13).

---

### D-10 — Redundant session references invite drift

**Severity:** MEDIUM · **ADR:** none required · **Roadmap:** B5

**Category:** ownership

`ClassGroup` carries `academic_session_id` (`07 §6.4`). `ClassSubject` carries `class_id` **and** `academic_session_id` (`07 §6.6`). `TeacherAssignment` carries `class_subject_id` **and** `academic_session_id` (`07 §6.8`). `StudentEnrollment` carries `class_id` **and** `academic_session_id` (`07 §6.7`).

Each of these can be derived from its parent, so each can disagree with it. A `ClassSubject` whose `academic_session_id` differs from its `ClassGroup`'s is a nonsense record that nothing prevents.

**Recommended mitigation**

Either drop the redundant columns and derive, or keep them for query performance and enforce agreement with composite foreign keys — the same technique recommended for `school_id` in `D-01`, and worth applying uniformly.

---

### D-11 — `HODAssignment` references its subject ambiguously

**Severity:** HIGH · **ADR:** none required; settle in B5 · **Roadmap:** B5

**Category:** ownership

`07 §6.9` gives `HODAssignment` an attribute written as _"user/membership"_ — the specification does not choose. Every comparable entity is precise: `TeacherAssignment` references `teacher_profile_id`, `StudentEnrollment` references `student_profile_id`.

This matters because there is no `HODProfile` (`06 §12` deliberately declines to create one), so an HOD is a `SchoolMembership` carrying an `HOD` `RoleAssignment`. Referencing `user_id` would let an assignment outlive the membership it depends on and would sidestep the school boundary; referencing `membership_id` keeps it tenant-safe.

**Recommended mitigation**

Reference `membership_id`, consistent with the tenancy model, and add a constraint or application invariant that the referenced membership holds an active `HOD` role assignment.

---

### D-12 — `Question.current_status` is both derived and stored

**Severity:** HIGH · **ADR:** none required; settle in B8 · **Roadmap:** B8

**Category:** state transitions

`07 §7.1` gives `Question` a `current_status` attribute and then says the state is _"derived primarily from its current/latest revision and lifecycle."_ Both stored and derived is the classic denormalisation hazard: a question whose latest revision is `APPROVED` while `current_status` still reads `UNDER_REVIEW` because one update path forgot to maintain it.

This is not cosmetic — the question bank's counters (`05 §15.1`: Draft 12, Submitted 8, Approved 143, Rejected 5, Archived 21) and the teacher's filter tabs (`04 §38`) read from it, and the exam builder's "approved questions only" rule (`A-C8`) must not consult a stale value.

**Recommended mitigation**

Do not store it. Derive from revisions, and if performance requires materialisation, maintain it in the same transaction as the revision transition with a test asserting the two never disagree. The exam builder's approved-only check must read the _revision_ status directly regardless, since it binds a specific revision.

---

### D-13 — Media assets across revisions have no defined lifecycle

**Severity:** MEDIUM · **ADR:** none required; settle in B8 · **Roadmap:** B4, B8

**Category:** immutability, historical preservation

`07 §7.4` binds `QuestionMedia` to a `question_revision_id` and a `media_asset_id`. When a teacher edits an approved question, a new revision is created (`A-C7`) — but nothing states whether the new revision references the same `MediaAsset` rows or copies them.

Sharing is efficient but dangerous: `07 §38` requires approved revision content to be immutable, and if Revision 3 shares a media asset with Revision 2, then replacing that image affects the historical revision that a completed exam depends on — silently changing what a student was shown, which is exactly the failure `06 §74` exists to prevent.

There is also no orphan policy: media uploaded to a draft that is never submitted, or belonging to an archived question, is never cleaned up (`M-14`).

**Recommended mitigation**

Treat `MediaAsset` as immutable once referenced by a submitted revision — new images create new assets rather than replacing bytes at an existing storage key. Sharing references across revisions is then safe. Object-storage keys should be content-addressed or include the asset id so no key is ever overwritten, which also aligns with `09 §22`'s use of S3 versioning.

---

## 9. Section G — Exam-Engine Risks

The highest-integrity subsystem, and the area `AGENTS.md §5` singles out as non-negotiable. Each risk names the specific failure it produces.

---

### X-01 — Auto-submission has no owner

**Severity:** BLOCKER · **ADR:** ADR-0004 · **Roadmap:** B14

**Concern:** timer authority, timeout

`07 §27` states that when `current_time >= expires_at` _"the system automatically transitions IN_PROGRESS → AUTO_SUBMITTED"_, and `05 §34` requires marking to follow. `04 §58` shows the student a "Time has expired / Your assessment has been submitted automatically" screen.

**No document says what performs this transition.** The three candidates behave very differently:

- **Client-initiated on expiry** — fails exactly when it matters most. A student whose browser crashed, whose machine lost power, or who simply closed the tab (all routine in the specified environment, `01 §10`) never triggers it, and the attempt sits `IN_PROGRESS` forever with no result.
- **Lazy, on next server touch** — the attempt finalises only when someone happens to query it. A student who never returns has no result until a teacher opens the Control Center, so `03 §41`'s "End Examination" check of `In Progress: 0` never clears and the exam cannot be completed.
- **Background sweeper** — a periodic job finding expired `IN_PROGRESS` attempts and finalising them. Correct, but nothing specifies its existence, cadence, idempotency, or what happens when it races a student submitting at the deadline.

**Failure produced**

Without a sweeper, abandoned attempts never finalise: the student gets no result, the exam never reaches `COMPLETED`, participation reporting is wrong, and `03 §41`'s closure workflow is permanently blocked. This is not an edge case — power loss mid-exam is a stated design constraint of the product.

**Recommended mitigation**

A BullMQ repeatable sweeper as the authority, finalising attempts past `expires_at` (plus the `A-06` grace window), plus opportunistic finalisation on any server touch of an expired attempt so the common case is immediate. Both paths must share one idempotent finalisation routine guarded by the attempt's state transition, so a race between sweeper, student submit, and teacher action produces exactly one submission. Test the race explicitly (B14).

---

### X-02 — The post-expiry cutoff policy does not exist

**Severity:** BLOCKER · **ADR:** ADR-0003 · **Roadmap:** B13

**Concern:** timer authority, answer persistence

See `A-06`. `08 §11.4` refers to a policy no document defines. Until it exists, the server cannot decide whether a late-arriving answer counts, which means the offline queue's flush behaviour is undefined, which means answers can be silently lost or silently accepted past the deadline.

**Failure produced**

Either students lose legitimately-answered questions to network latency they cannot control, or students gain time by going offline — the exact integrity violation `03 §36` and `07 §42 Invariant 7` prohibit.

---

### X-03 — Concurrent start produces duplicate attempts

**Severity:** HIGH · **ADR:** none required; design in B13 · **Roadmap:** B13

**Concern:** concurrent starts, duplicate submissions

See `D-09`. A double-clicked Start, a refresh during a slow start, or a retried request after a timeout each produce two concurrent creation paths that both pass application validation.

**Failure produced**

Two `IN_PROGRESS` attempts, two snapshot sets, answers split unpredictably between them, two results for one student on one exam. Violates `07 §42` invariants 8 and 11. Difficult to repair after the fact because both attempts contain genuine student work.

**Recommended mitigation**

Partial unique index plus idempotent start (`D-09`, `M-16`). `09 §48` names this one of three areas requiring load testing before the full system is built.

---

### X-04 — Offline queue replay ordering and late arrival

**Severity:** HIGH · **ADR:** ADR-0007 · **Roadmap:** B13

**Concern:** answer persistence, disconnect/reconnect

`08 §11.2` has the client queue changes locally and synchronise on reconnection with idempotent identifiers; `08 §12.3` requires deterministic reconciliation.

Unspecified: ordering guarantees when replaying a queue where the same question was answered three times offline, and what the server does when a replayed write for question 7 arrives _after_ a newer online write for the same question. A naive last-write-wins on server receipt time reverts the student's newer answer to an older one.

**Failure produced**

A student's final answer silently replaced by an earlier one — undetectable to the student, and materially affecting their score.

**Recommended mitigation**

Carry a client-assigned monotonic sequence number (or client timestamp used solely for ordering, never for admissibility per `A-06`) per attempt-question, and have the server reject any write whose sequence is lower than the stored one. This makes replay order-independent. Test with an interleaved online/offline sequence (B13).

---

### X-05 — The answer key travels toward the client

**Severity:** BLOCKER · **ADR:** none required — this is a defect to prevent · **Roadmap:** B13

**Concern:** question snapshots, exam integrity

`07 §9.2` includes `correct_answer_snapshot` among `AttemptQuestionSnapshot`'s attributes, and `07 §24` confirms the snapshot records _"correct answer reference needed for marking"_. `08 §11.1` step 7 then has the client receive _"the attempt package"_, and `09 §8` stores `question_snapshots` in IndexedDB.

No document anywhere states that the correct answer must be excluded from what the client receives.

**Failure produced**

A student opens browser developer tools during the exam, inspects IndexedDB, and reads the answer key for every question. This is trivial to do, requires no special skill, and would be discovered quickly once the product is in real labs. It would be a catastrophic failure for a high-stakes examination platform and would be entirely self-inflicted.

**Recommended mitigation**

Make it an explicit, tested contract rule: the attempt package sent to the client is a **projection** of the snapshot that omits `correct_answer_snapshot` and any marking metadata. Marking happens exclusively server-side against the stored snapshot. Add a contract test asserting the student-facing attempt payload contains no correct-answer field, and treat it as a release-blocking test (B13, B22). The offline design makes this non-negotiable: anything sent for offline use is permanently readable by the student.

---

### X-06 — Pool draw would change the start transaction

**Severity:** BLOCKER · **ADR:** ADR-0002 · **Roadmap:** B11, B13

**Concern:** question snapshots, result calculation

If `C-09` resolves toward question pools, the start transaction must draw a per-student question set before snapshotting, guarantee equal total marks across draws, and record the draw for audit. Question analytics must then account for unequal exposure. None of this is specified. Until ADR-0002 is decided, B13 cannot finalise its start-attempt design.

---

### X-07 — Duplicate submission

**Severity:** HIGH · **ADR:** none required; design in B14 · **Roadmap:** B14

**Concern:** duplicate submissions

`08 §11.3` requires idempotent submission: _"Repeating the same submission request should not generate duplicate results or duplicate attempts."_ The risk is concrete — a student on a slow lab network clicks Submit, sees no response, and clicks again; meanwhile the sweeper (`X-01`) may be finalising the same attempt at the deadline.

**Failure produced**

Two marking runs, potentially two `Result` rows violating the 1:1 cardinality, or a partially-marked result if the second run interleaves with the first.

**Recommended mitigation**

Guard the transition with a conditional state update (`UPDATE ... WHERE state = 'IN_PROGRESS'`) so exactly one caller wins, have losers return the existing final state rather than an error, and make marking idempotent and keyed on the attempt so a re-queued marking job overwrites rather than duplicates. Test with simultaneous submit + expiry + sweeper (B14).

---

### X-08 — Client clock manipulation and timer drift

**Severity:** MEDIUM · **ADR:** none required · **Roadmap:** B13

**Concern:** timer authority

`08 §11.4` requires that device clock manipulation must not extend an attempt, and `09 §7` restates that the PWA is not the authority. But the client must display a countdown, and a countdown computed as `expires_at − Date.now()` uses the device clock — so a student who sets their machine's clock back sees a longer countdown. The server still rejects late writes, so the _integrity_ holds; the _experience_ does not, and a student could work for twenty minutes believing they have time and lose all of it.

**Recommended mitigation**

Derive the countdown from a server-provided remaining-seconds value captured at attempt start and decremented against a monotonic clock (`performance.now()`), not wall-clock time, and re-synchronise remaining time on every server response. Display a clear warning if server and client disagree beyond a threshold.

---

### X-09 — "In Progress" cannot be distinguished from abandoned

**Severity:** MEDIUM · **ADR:** ADR-0020 · **Roadmap:** B12

**Concern:** disconnect/reconnect, batch access

See `M-09`. Without liveness, the Control Center cannot render the "2 students are disconnected" warning `05 §73` requires, and a teacher deciding whether to release the next batch cannot tell whether 15 "In Progress" students are working or whether five machines have died.

**Failure produced**

Operational rather than data-integrity: the teacher's core batch-management decision is made on incomplete information, which is precisely the problem the Control Center exists to solve (`04 §69`).

---

### X-10 — Media unavailable offline

**Severity:** HIGH · **ADR:** ADR-0021 · **Roadmap:** B13

**Concern:** answer persistence, disconnect/reconnect

See `R-06`. A student offline mid-attempt sees broken images where the diagram is the question.

**Failure produced**

The student cannot answer questions they were shown, through no fault of their own, in a system explicitly designed to tolerate connectivity loss (`03 §36`). This would undermine the product's central resilience claim in the most visible possible way.

---

### X-11 — Accommodations have no defined application point

**Severity:** HIGH · **ADR:** none required; design in B13 · **Roadmap:** B13

**Concern:** timer authority, makeup attempts

`07 §9.7` defines `StudentAssessmentAccommodation` with types such as `EXTENDED_TIME`, and `07 §9.1` gives `ExamAttempt` a `duration_granted_seconds` distinct from the exam's duration — the right shape. But nothing states when the accommodation is resolved, whether it applies to makeup attempts, or what happens if an accommodation is granted while an attempt is already in progress.

**Failure produced**

Extending time mid-attempt by mutating `expires_at` would breach the timer-integrity invariant (`07 §42 Invariant 7`) unless explicitly modelled as an audited exception — and without a stated rule, an implementer may simply allow the update.

**Recommended mitigation**

Resolve accommodations at attempt creation and freeze `duration_granted_seconds` for the life of the attempt. Any change to a running attempt's duration is a separate, audited administrative action with its own event type and permission, not an implicit consequence of editing an accommodation record. Accommodations apply to makeup attempts on the same basis unless scoped otherwise.

---

### X-12 — Makeup interacts with `attempt_limit` in an unstated way

**Severity:** HIGH · **ADR:** ADR-0014 · **Roadmap:** B16

**Concern:** makeup attempts, attempt invalidation

`07 §9.1` invariant 1 caps completed attempts at `attempt_limit` (default 1). A makeup attempt is a second `ExamAttempt` against the same exam. For an absent student the first attempt does not exist, so the cap is not reached — fine. But three cases are unresolved:

- A student whose attempt was **invalidated** and who is granted a makeup: does the invalidated attempt count toward the limit?
- A student who sat the exam and is granted an exceptional retry (`C-11`): the cap is already reached.
- Whether `MakeupAuthorization` bypasses the cap or raises it, and whether it is single-use (`07 §9.6` has a `USED` status implying single-use, but the rule is not stated as an invariant).

**Failure produced**

Either legitimate makeups are refused, or the attempt cap becomes unenforceable — the latter meaning a student could accumulate attempts.

**Recommended mitigation**

State the rule explicitly: an attempt may be created if completed non-invalidated attempts are under `attempt_limit`, **or** an unused `AttemptAuthorization` exists; authorizations are single-use and transition to `USED` atomically with attempt creation; `INVALIDATED` and `CANCELLED` attempts do not count toward the limit. Encode as a database-enforced invariant where possible, and test each case (B16).

---

### X-13 — Invalidating a running attempt has no defined student experience

**Severity:** MEDIUM · **ADR:** none required; design in B13 · **Roadmap:** B12, B13

**Concern:** attempt invalidation

`03 §76` and `05 §30` allow a teacher to invalidate an attempt after the student has started — for example when the wrong student was authorized. `07 §16` permits `IN_PROGRESS → INVALIDATED`. Nothing specifies what the student sees.

**Failure produced**

Without a defined behaviour, the student's client continues showing a working exam and continues queuing answers against an attempt the server will reject — potentially for the rest of the sitting. The student believes they are being assessed when they are not.

**Recommended mitigation**

The server rejects further writes with a distinct, non-retryable error code (`M-16`); the client recognises it, stops the timer, clears the local queue, and shows an explicit terminal screen directing the student to their invigilator. Requires the error contract from `M-16` and an F13 screen state that no document currently lists among `04 §57`'s warning states.

---

### X-14 — Result recalculation after adjustment

**Severity:** HIGH · **ADR:** ADR-0025 · **Roadmap:** B15

**Concern:** result calculation

`03 §73`, `05 §53`, and `07 §34` specify controlled adjustments — voiding a question across an exam, awarding a mark to all eligible attempts, recalculating. `08 §14` lists _"result recalculation after controlled adjustments"_ as background work.

Unspecified: whether a bulk adjustment across 1,200 results is atomic or incremental, what happens if it fails partway, whether recalculation is idempotent if re-run, and how a recalculation racing a concurrent publication is resolved.

**Failure produced**

A partially-applied adjustment leaves some students regraded and others not — with results already published and visible. Detecting and repairing that after the fact is exactly the situation `A-C16` exists to prevent.

**Recommended mitigation**

Model a bulk adjustment as a single parent operation with per-result child records, processed idempotently and resumably, with the exam's results held unpublished (or explicitly marked as under adjustment) until the whole operation completes. Every child writes its own audit event so the adjustment is reconstructable. Test partial failure and re-run (B15).

---

## 10. Traceability — Findings to Roadmap Phases

Every BLOCKER and HIGH finding is assigned a phase that must resolve or mitigate it. The roadmap phases referenced here are defined in `docs/roadmaps/backend-roadmap.md` and `docs/roadmaps/frontend-roadmap.md`.

| Phase                                     | Findings this phase must resolve                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| **B0** — Engineering foundation           | R-02, R-11, D-01, M-12, M-16, R-01, R-08                                           |
| **B1** — Identity & authentication        | A-01, A-02, C-14, M-07, R-02                                                       |
| **B2** — Authorization engine             | A-03, C-06, C-07, M-15, R-01                                                       |
| **B3** — Platform, schools, subscriptions | C-13, D-04, A-10, M-07, C-06                                                       |
| **B4** — Media & branding                 | R-06, A-18, D-13                                                                   |
| **B5** — Academic structure               | C-04, M-01, D-02, D-10, D-11, M-02                                                 |
| **B6** — People & enrollment              | M-02, C-10, M-05                                                                   |
| **B7** — Bulk import                      | A-17                                                                               |
| **B8** — Question bank                    | C-04, D-12, A-16, D-13                                                             |
| **B9** — Question review & governance     | M-01, C-10                                                                         |
| **B10** — Audit & notifications           | C-02, M-07                                                                         |
| **B11** — Exam builder                    | C-09, M-03, D-03, A-12, A-15, X-06                                                 |
| **B12** — Exam activation & control       | C-03, C-08, A-04, A-14, M-09, X-09, R-04, X-13                                     |
| **B13** — Attempt engine                  | X-02, X-03, X-04, X-05, X-10, X-11, A-06, A-07, A-08, D-05, D-09, R-03, R-05, R-07 |
| **B14** — Submission & marking            | X-01, X-07                                                                         |
| **B15** — Results & publication           | C-05, A-09, A-11, D-08, M-06, X-14                                                 |
| **B16** — Participation, absence, makeup  | A-05, D-07, C-11, M-04, X-12                                                       |
| **B17** — Analytics                       | A-11, C-09                                                                         |
| **B18** — Reporting & export              | A-13, M-17                                                                         |
| **B19** — Session rollover                | M-10, M-11                                                                         |
| **B20** — Security hardening & compliance | M-13, M-14                                                                         |
| **B21** — Performance & load              | R-03, R-05, R-08, R-09, R-12                                                       |
| **B22** — Failure, recovery & DR          | R-01, R-12, X-05                                                                   |
| **B23** — Production readiness            | R-09, R-10                                                                         |

---

## 11. Audit Conclusions

### What this audit did not do

- It did not modify any specification document.
- It did not resolve any contradiction unilaterally. Every recommendation was labelled as such; decisions requiring product, commercial or domain judgement were referred to the project owner.
- It did not remove approved scope. Where the audit recommended deferral (`C-09` question pools, `A-13` PDF reporting, `A-12` section authoring, `C-10` HOD requests), each was decided explicitly and recorded as an **approved deferral** in [`../decisions/README.md`](../decisions/README.md) — not silently dropped.

### Resolution — 2026-08-24

All 33 decisions are recorded in [`../decisions/`](../decisions/). Twelve required the project owner's judgement and were referred; twenty-one were engineering-shaped and taken against the audit's recommendations.

The findings that most threatened delivery are settled:

| Finding                                   | Resolution                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `C-04`/`M-01` academic scope uncomputable | `Subject.department_id` + `Question.level` + `Topic` entity (ADR-0001)             |
| `C-09` question pools                     | Deferred; fixed selection, with order and option randomisation retained (ADR-0002) |
| `X-01` auto-submission unowned            | BullMQ sweeper + opportunistic finalisation, one idempotent routine (ADR-0004)     |
| `X-02` cutoff policy undefined            | 60s grace against server receipt time, flagged, non-retryable beyond (ADR-0003)    |
| `X-05` answer key reaching the client     | Client projection omits it; release-blocking contract test in B13 (ADR-0008)       |
| `A-01` login has no tenant resolution     | Per-school subdomain; `login_identifier` unique per school (ADR-0005)              |

### Residual risk

Two decisions carry conditions rather than being final:

- **ADR-0028** — the retention schedule is provisional. Indefinite retention is the safe default, but B20's legal review may change it, and indefinite retention of minors' data may itself attract scrutiny.
- **ADR-0032** — `eu-west-1` is chosen on reasoning, not measurement. B21 must validate RTT from representative Nigerian networks and may trigger an amendment before B23 provisions production.

Three decisions deliberately accept a cost that B21 must size: the answer-event log's write amplification (ADR-0007), the heartbeat's sustained write volume (ADR-0020), and the attempt package's media payload (ADR-0021).

`X-05` remains a **defect to prevent, not a decision** — there is no ADR for it by design, and its contract test is release-blocking.

### Documents read in full for this audit

`docs/01-product-vision.md` (2,894 lines) · `docs/02-roles-permissions.md` (526) · `docs/03-school-lifecycle.md` (2,624) · `docs/04-module-screen-map.md` (1,969) · `docs/05-functional-requirements.md` (2,452) · `docs/06-domain-data-model.md` (2,544) · `docs/07-erd-state-transitions.md` (2,693) · `docs/08-technical-architecture.md` (713) · `docs/09-technology-selection-and-technical-stack-evaluation.md` (1,856) · `PROJECT.md` · `CLAUDE.md` · `AGENTS.md`

**Total: 18,271 lines of specification.**
