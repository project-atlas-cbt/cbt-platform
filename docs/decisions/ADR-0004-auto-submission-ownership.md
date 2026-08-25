# ADR-0004 — Auto-submission mechanism and ownership

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** X-01 (BLOCKER), A-14
**Blocks phases:** B14

## Context

`07 §27` states that when `current_time >= expires_at` _"the system automatically transitions IN_PROGRESS → AUTO_SUBMITTED"_, and `04 §58` shows the student a corresponding screen.

**No document says what performs this transition.** The gap matters because `01 §10` names power loss and machine failure as design constraints — the student whose attempt most needs finalising is precisely the one whose browser will never run any client-side code again.

Without an owner: the attempt sits `IN_PROGRESS` forever, the student never receives a result, `03 §41`'s "End Examination" check of `In Progress: 0` never clears, and the exam can never reach `COMPLETED`.

## Options considered

1. **Client-initiated on expiry** — fails exactly when it matters: closed tab, crashed browser, lost power.
2. **Lazy, on next server touch** — an abandoned attempt finalises only if someone happens to query it.
3. **Background sweeper** — periodic job finding expired attempts.

## Decision

**A background sweeper as the authority, plus opportunistic finalisation, sharing one idempotent routine.**

- A **BullMQ repeatable job** scans for `IN_PROGRESS` attempts past `expires_at` plus the [ADR-0003](./ADR-0003-post-expiry-cutoff-policy.md) grace window and finalises them.
- **Opportunistic finalisation**: any server request touching an expired attempt finalises it immediately, so the common case — a student still connected at expiry — needs no waiting.
- Both paths call **one idempotent finalisation routine** guarded by a conditional state transition (`UPDATE ... WHERE state = 'IN_PROGRESS'`), so exactly one caller wins.
- Sweeper cadence sized against B21 load results; it must never contend with the interactive answer path.
- Auto-submission emits `ATTEMPT_AUTO_SUBMITTED`.

Related, resolving `A-14`: `COMPLETED` remains an **explicit, audited operator action** requiring zero in-progress attempts — never automatic, because it is the moment absences are confirmed. A staleness check flags exams left `OPEN` beyond a threshold to the Control Center rather than closing them.

## Consequences

**Easier**

- An attempt abandoned by power loss still finalises, gets marked, and produces a result.
- `03 §41`'s exam-completion check can actually clear.
- One routine means one place where correctness lives.

**Harder**

- A three-way race exists between manual submit, opportunistic finalisation and the sweeper. It must be tested directly, not reasoned about (B14).
- The sweeper is a scheduled job that must run reliably in production; its failure is silent unless monitored. It belongs in the Exam Health Monitor (B20).

**Required changes**

- B14: sweeper, opportunistic finalisation, shared idempotent routine, conditional transition.
- B14 testing: simultaneous submit + expiry + sweeper yields exactly one submission; a fully abandoned attempt is finalised and marked.
- B20: sweeper health alerting.
- B23: sweeper enabled as a scheduled production job.
