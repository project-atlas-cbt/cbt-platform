# ADR-0003 — Post-expiry cutoff policy and grace window

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** X-02 (BLOCKER), A-06 (BLOCKER)
**Blocks phases:** B13

## Context

`08 §11.4` states: _"When the server receives an answer after expiry, the server applies **the defined cutoff policy** rather than trusting client time."_

**No document defines that policy.** It is a forward reference to something never written, and until it exists the server cannot decide whether a late answer counts — which means the offline queue's flush behaviour is undefined.

The realistic case: a student selects an answer at `expires_at − 2s`; the request arrives at `expires_at + 400ms` because of school-network latency. Three defensible behaviours exist, and they differ in whether a student loses work through latency they cannot control.

`09 §48` flags this as one of three areas requiring conservatism.

## Options considered

1. **Accept using the client's timestamp** — trusts a client-supplied time, which `08 §11.4` explicitly warns against and which lets a manipulated clock extend an attempt.
2. **Reject everything after `expires_at`** — correct but penalises students for network latency on exactly the unstable networks this product targets.
3. **Bounded grace window measured against server receipt time.**

## Decision

**A bounded grace window against server receipt time.**

- Answer writes arriving up to **60 seconds** after `expires_at` are accepted.
- The window is configurable **per environment**, never per school — it is an integrity parameter, not a school policy.
- `answered_at` is recorded as the **server receipt time**.
- Writes accepted inside the grace window are **flagged**, so they are visible in the attempt audit and in any dispute.
- Writes arriving beyond the window are rejected with a distinct, **non-retryable** error code per [ADR-0033](./ADR-0033-idempotency-and-error-contract.md), so the offline client drops them rather than retrying forever.
- **A client-supplied timestamp is never used to decide admissibility** — only, at most, for ordering (see [ADR-0007](./ADR-0007-answer-persistence-model.md)).
- Offline queues flushed after reconnection are subject to the same rule.

## Consequences

**Easier**

- Latency no longer costs students their answers.
- The offline client has a deterministic rule to reconcile against (`08 §12.3`).
- Timer integrity holds: no amount of disconnection extends an attempt (`07 §42` invariant 7).

**Harder**

- A student offline for more than 60 seconds past expiry **loses those answers**. This is a real, student-visible consequence and must be stated plainly in the exam instructions (`05 §71`) and surfaced by the client when it happens — it must not be a silent loss.
- The grace flag adds a column and a reporting concern.

**Required changes**

- B13: grace-window enforcement on answer writes; flagging; non-retryable rejection beyond the window.
- B14: submission honours the same window.
- F13: surface dropped answers to the student explicitly; cover in the offline-at-expiry browser test.
- F21: exam instructions state the consequence of prolonged disconnection.
