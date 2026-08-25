# ADR-0012 — Software Admin authority over school academic content

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** C-06 (HIGH), C-07 (MEDIUM), M-15 (MEDIUM)
**Blocks phases:** B2, B3

## Context

`02` contradicts itself. Its matrix grants Software Admin **Full** on numerous school academic rows — archive question, Exam Control Center, manually allow student, grant makeup, mark absence, end individual attempt, **invalidate attempt**, view results, promote students, force password reset. Yet `02 §5` states the opposite intent: _"Software Admin has **emergency/support-level access**, with all such actions audited... We don't want a platform operator casually editing a school's examination questions or scores."_

The matrix is also internally inconsistent: Software Admin is **—** for "Create exam", "Publish results" and "Unpublish results", yet **Full** for "Invalidate attempt" and "Grant makeup access" — a strictly more dangerous set.

This is a commercial-trust decision as much as a technical one: schools are being asked to run high-stakes examinations on this platform.

## Decision

**Read plus audited break-glass.** `02 §5` and `08 §10` express the intent; the matrix cells are read as capability ceilings, not defaults.

| Category                                                                                                         | Authority                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Platform operations — school CRUD, subscription, activation, platform analytics and audit                        | Unrestricted                                                                                                                    |
| School academic **reads**                                                                                        | Permitted, audited                                                                                                              |
| School academic **writes** — invalidate attempt, grant makeup, archive question, force reset, deactivate account | **Break-glass only**: stated reason required, elevated audit event emitted, visible to the School Admin in their own audit view |
| Content authoring — create exam, create or approve question, publish results                                     | **Denied outright**, matching the matrix's own `—` cells                                                                        |

### Related resolutions

**`C-07` — "Limited" exam creation.** Exam **authoring** is a teacher capability. School Admin and Moderator hold exam **administration** (open, close, allow students, grant makeup, publish) plus the ability to edit or delete a draft on a teacher's behalf. The "Limited" cell for Create exam resolves to `—`.

**`M-15` — Exam Operator capability.** Add `ExamAdministrator` (exam × membership, assigned_by, status) so administration can be delegated per exam without inventing a role. "Own exam" in the matrix means `created_by` **or** an active `ExamAdministrator`. This implements `02 §11`'s distinction between _Created by_ and _Administered by_ without the role explosion `02 §10` warns against.

## Consequences

**Easier**

- A defensible answer during procurement: operators cannot silently alter a school's academic records.
- Break-glass is a distinct, monitorable code path rather than an invisible superuser bypass.
- `02 §11`'s delegated-invigilator case becomes expressible.

**Harder**

- Support cannot fix a school's data as quickly; some incidents require the school to act.
- Break-glass needs its own UI, reason capture, and school-visible audit surface.
- Every guard must distinguish platform authority from school-academic authority rather than treating `SOFTWARE_ADMIN` as a wildcard.

**Required changes**

- B2: break-glass path; `ExamAdministrator`; `SOFTWARE_ADMIN` is not a wildcard in the policy layer.
- B3: break-glass endpoints with reason capture.
- B10: elevated audit event type, surfaced in the school's own audit view.
- F3: break-glass UI warning that the action is audited and school-visible.
