# ADR-0015 — Subscription expiry behaviour and grace period

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** A-10 (HIGH), C-13 (HIGH)
**Blocks phases:** B3, B13

## Context

The principle is consistent across the corpus: expiry never destroys academic data (`01 §48`, `03 §66`, `05 §4.2`, `07 §42` invariant 14). The **runtime behaviour** is not.

`03 §66` sketches restricted access but marks the grace period as _"a commercial decision later."_ `03 §67` states an already-started attempt _"should not suddenly disappear"_ and must be _"preserved and finalized safely"_ — without saying whether the student may keep answering, or only submit.

The guard must answer, for a school whose subscription expired 30 seconds ago with 400 students mid-exam: can they keep answering? Can they submit? Does marking run? Is the Control Center available?

## Decision

### 14-day grace period

- Escalating warnings before expiry (`05 §4.2`).
- **14 days of full access after expiry**, then restriction.
- Chosen to accommodate school finance cycles without giving away a month of service, and — critically — so expiry never lands mid-examination-week by surprise.

### `EXPIRED` capability profile

**Permitted:**

- Existing `IN_PROGRESS` attempts continue to completion — **answer writes and submission both allowed**. `03 §67`'s principle is meaningless if the exam cannot actually finish.
- Marking, result finalisation and the auto-submission sweeper run normally.
- The Exam Control Center remains available read-plus-close for the duration of running attempts.
- Read access to all historical data.
- Renewal and subscription screens.

**Blocked:**

- Opening new exam sessions.
- Starting new attempts.
- Creating or modifying exams and questions.
- Bulk imports.

**Never:** any deletion or modification of academic data (`07 §42` invariant 14).

## Consequences

**Easier**

- A live examination cannot be destroyed by a billing event.
- Schools get a predictable, explainable policy.
- The restriction set is enumerable and testable.

**Harder**

- The guard needs a capability profile rather than a boolean, and every write endpoint must declare which side it falls on.
- 14 days of post-expiry service is a real commercial cost per lapse.
- A school could, in principle, run exams throughout the grace period without paying — accepted deliberately, since the alternative risks interrupting a school mid-term.

**Required changes**

- B3: grace period; escalating warnings; the `EXPIRED` capability profile as a shared guard.
- B13/B14: attempt continuation and marking explicitly permitted under `EXPIRED`.
- B3 testing: expiry occurring while an attempt is `IN_PROGRESS` follows this profile exactly; a row-count assertion proves no academic data is destroyed.
- F5: subscription status and renewal messaging.
