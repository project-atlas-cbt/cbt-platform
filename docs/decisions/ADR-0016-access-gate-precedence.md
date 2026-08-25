# ADR-0016 — Authoritative access gate: school versus subscription status

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** C-13 (HIGH), D-04 (HIGH), C-14 (LOW)
**Blocks phases:** B3

## Context

Two status fields can express the same condition, with no stated precedence:

- `School.status` (`07 §4.1`): `PROVISIONAL / ACTIVE / SUSPENDED / EXPIRED / DEACTIVATED`
- `Subscription.status` (`07 §4.2`): `PENDING / ACTIVE / EXPIRING / EXPIRED / SUSPENDED / CANCELLED`

Both carry `ACTIVE`, `SUSPENDED` and `EXPIRED`. `03 §66` shows _"School status: EXPIRED"_ driving behaviour; `05 §4.2` describes expiry entirely in subscription terms.

Two overlapping status fields on the hot path of every request is a correctness hazard: they can disagree, and the authorization layer must pick one. If a guard reads `School.status` while a job expires `Subscription.status`, schools keep working past expiry — or worse, a paying school is locked out mid-examination.

`05 §4.1` also uses `EXPIRING_SOON` where `06`/`07` use `EXPIRING`.

## Decision

**Subscription is commercial truth; `School.status` is the derived access gate.**

- `Subscription` holds the commercial facts: plan, dates, status.
- `School.status` is a **derived, cached** value maintained by the subscription lifecycle and by explicit platform actions. It is never set independently to `EXPIRED`.
- **One shared resolution function** computes effective access, and every guard calls it. No guard reads either field directly.
- **Precedence:** `DEACTIVATED` > `SUSPENDED` > subscription-derived state.
  `DEACTIVATED` and `SUSPENDED` remain independently settable by Software Admin, since those are platform actions unrelated to billing and must override an otherwise-valid subscription.
- Enum value is **`EXPIRING`**, per `06`/`07` as the canonical documents. `05 §4.1`'s `EXPIRING_SOON` is a wording variant, not a different state.

### Related — account status precedence (`C-14`)

Three status fields exist on the identity side. Each gets one meaning, consulted in order:

| Field                     | Question it answers                     | Values                                      |
| ------------------------- | --------------------------------------- | ------------------------------------------- |
| `User.status`             | Can this person authenticate at all?    | `INVITED / ACTIVE / SUSPENDED / INACTIVE`   |
| `SchoolMembership.status` | Are they currently part of this school? | `PENDING / ACTIVE / INACTIVE / ENDED`       |
| `StudentProfile.status`   | Academic standing only                  | `ACTIVE / GRADUATED / WITHDRAWN / ARCHIVED` |

`GRADUATED` belongs to the profile, not the account. `REACTIVATED` is **not** a school state — it is a transition back to `ACTIVE`, already recorded by the audit event and `ActivationGrant` history.

## Consequences

**Easier**

- One function owns access resolution, so the two fields cannot drift.
- Platform suspension can override a valid subscription, which is required for abuse handling.
- Identity guards have unambiguous fields to consult.

**Harder**

- The derived value must be recomputed on every subscription transition and by the expiry sweeper; a missed recomputation is a stale gate.

**Required changes**

- B3: resolution function; derived maintenance; `EXPIRING` enum.
- B1: three-field precedence in the auth guard.
- B2: all guards call the shared resolver.
