# ADR-0014 — Attempt authorization: makeup and exceptional reattempt

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** C-11 (HIGH), M-04 (HIGH), X-12 (HIGH)
**Blocks phases:** B16

## Context

`03 §45` describes an _"Exceptional Reattempt"_ that privileged users can authorize. `03 §75` and `05`'s edge-case matrix repeat it. `07 §9.1` provides the `RETRY` attempt type and an `attempt_limit`.

But the only authorization entity is `MakeupAuthorization` (`07 §9.6`), scoped to absence — it _"creates another attempt; it does not modify the original absence."_ Nothing authorizes a `RETRY` for a student who **did** sit the exam. With `attempt_limit = 1` (the specified default), the documented capability is unimplementable: a teacher facing a genuinely corrupted attempt has no legitimate path except invalidating the original, which changes its meaning.

`X-12` adds three unresolved interactions: whether an invalidated attempt counts toward the limit, whether an authorization bypasses or raises it, and whether authorizations are single-use.

## Decision

**Generalise `MakeupAuthorization` into `AttemptAuthorization`.**

- Carries a `type` of `MAKEUP` or `RETRY`, extensible to `SPECIAL`.
- Retains all existing fields: `authorized_by`, `reason`, `authorized_at`, `expires_at`, `status` (`AUTHORIZED / USED / REVOKED / EXPIRED`).

### The attempt-creation rule, stated explicitly

An attempt may be created if:

> completed, **non-invalidated** attempts are under `attempt_limit`
> **or** the student holds an unused `AttemptAuthorization` for this exam.

- Authorizations are **single-use**, transitioning to `USED` **atomically with attempt creation** — enforced by constraint, so two concurrent consumptions cannot both succeed.
- `INVALIDATED` and `CANCELLED` attempts **do not count** toward `attempt_limit`.
- `MAKEUP` never modifies the original participation record (`07 §42` invariant 10).
- `RETRY` emits a distinct audit event, `ATTEMPT_RETRY_AUTHORIZED`, and is deliberately more visible than a makeup grant, per `03 §45`'s requirement that it be _"extremely visible in the audit trail."_

## Consequences

**Easier**

- Both documented capabilities become implementable through one entity.
- The attempt cap is enforceable and unambiguous.
- A corrupted attempt has a legitimate remedy that does not distort the record.

**Harder**

- Two authorization types with different audit weight need distinct UI and permissions, so the operator understands which they are granting.
- The atomic consume-and-create adds a constraint interaction that must be concurrency-tested.

**Required changes**

- B16: `AttemptAuthorization`; single-use constraint; the attempt-creation rule as a database-enforced invariant where possible.
- B13: start transaction consults the rule.
- B10: `ATTEMPT_RETRY_AUTHORIZED` audit action.
- B16 testing: two concurrent consumptions of one authorization — exactly one succeeds.
- F16: distinct makeup and retry actions, each requiring a reason.
