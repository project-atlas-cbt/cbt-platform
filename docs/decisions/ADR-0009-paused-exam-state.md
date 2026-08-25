# ADR-0009 — `PAUSED` is not an exam state

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** C-03 (HIGH)
**Blocks phases:** B12

## Context

`01 §4` lists exam states as `DRAFT / READY / ACTIVE / PAUSED / COMPLETED / ARCHIVED`, and `01 §5` devotes a section to `PAUSED`, defining it as _"prevent new students from starting"_ while _"existing attempts remain preserved."_ The `02` permission matrix grants "Pause exam" to four roles.

But no canonical state machine contains `PAUSED`. `03 §28`, `05 §24`, `06 §38` and `07 §8.1`/`§14` all give exactly `DRAFT → READY → OPEN → CLOSED → COMPLETED → ARCHIVED` plus `CANCELLED`.

Critically, the semantics `01 §5` assigns to `PAUSED` — _stop new starts, preserve running attempts_ — are **identical** to what `03 §40` and `05 §27` call "Close for New Attempts."

## Decision

**Do not add a `PAUSED` state. "Pause" is the UI label for `OPEN → CLOSED`.**

- `OPEN → CLOSED` already carries exactly the specified semantics: no new starts, running attempts continue to completion.
- `CLOSED → OPEN` is "Resume" / "Reopen".
- The `02` matrix's "Pause exam" permission maps onto the close/reopen capability.

A genuinely distinct pause — one that also **suspends running attempt timers** — is a materially different feature with severe timer-integrity consequences (`07 §42` invariant 7). It would need its own ADR, its own state, and its own test suite. It is not in scope.

## Consequences

**Easier**

- One state machine, one code path, no redundant state.
- The exam lifecycle stays exactly as `07 §14` specifies.

**Harder**

- The UI must make the behaviour unmistakable under pressure. A teacher clicking "Pause" during a lab incident may expect running students to stop; they do not. F12's Definition of Done requires this be stated clearly at the point of action.

**Required changes**

- B12: no `PAUSED` state; close/reopen transitions only.
- F12: label and explain the action so the preserved-attempts behaviour is obvious.
