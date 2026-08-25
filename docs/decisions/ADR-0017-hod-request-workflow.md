# ADR-0017 — HOD request/approval workflow withdrawn

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** C-10 (MEDIUM), M-05 (MEDIUM)
**Blocks phases:** B6, B9

## Context

`02`'s permission matrix contains four cells describing a request/approval mechanism that appears nowhere else in the corpus:

- "Assign teacher → subject": HOD **Limited/request**
- "Assign teacher → class": HOD **Limited/request**
- "Move student between classes": HOD **Request/approve**
- "Invalidate attempt": Teacher **Request / limited**

There is no request entity in `06` or `07`, no request screen in `04`, no request behaviour in `05`, and no request notification type in `06 §64`. Taken literally, four permission cells promise a general-purpose approval subsystem bolted onto four unrelated operations.

## Decision

**Withdraw the request semantics for this release.**

- **Assignments and student moves** — HOD has no authority. These stay with Moderator and School Admin, whom the same matrix already grants **Full**. Those cells read as `—`.
- **Invalidate attempt** — Teacher reads as **Full for own exam**, consistent with the adjacent "End individual attempt: Teacher — Own exam" cell. The action requires a reason and emits `ATTEMPT_INVALIDATED`, as `05 §30` already specifies.
- HODs retain full academic governance over questions, which is the role `02 §2` and `02 §12` define for them.
- Recorded as a **candidate for a later release**, not a rejected idea.

## Consequences

**Easier**

- No uncosted subsystem enters the initial release.
- The permission model stays expressible in the closed vocabulary of scope predicates defined by [B2's normalised permission table](../roadmaps/backend-roadmap.md).
- HOD authority matches the academic-governance role consistently.

**Harder**

- In a large school, an HOD noticing a mis-assignment must ask a Moderator rather than raising a tracked request. Acceptable for the initial release; revisit if pilot feedback shows friction.

**Required changes**

- B2: the four cells encoded per this decision in the normalised permission table.
- B6: HOD cannot change assignments or move students.
- B9: HOD academic authority unchanged.
- F7: no request UI; HOD sees read-only assignment views.

## Revisiting

If a request/approval subsystem is later approved, it needs its own specification and its own roadmap phase — model, screens, notifications, and state machine. It is not an extension of B2 or B6.
