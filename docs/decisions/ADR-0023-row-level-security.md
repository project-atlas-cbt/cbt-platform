# ADR-0023 — Row-Level Security as defence in depth

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** R-01 (HIGH), D-01 (BLOCKER)
**Blocks phases:** B0, B2

## Context

Tenant isolation is the platform's primary promise (`05 §1.1`, `06 §3`, `07 §42` invariant 1, `AGENTS.md §6`). `08 §7.2` requires that _"foreign keys and application-level authorization must both enforce tenant boundaries."_

Foreign keys alone do not enforce tenant integrity. A key from `Exam.class_id` to `ClassGroup.class_id` does not prevent School A's exam referencing School B's class unless the constraint carries `school_id` on both sides.

Without a database-level control, every cross-tenant guarantee depends on every query in ~15 modules — plus background workers, exports, cache keys and object-storage paths — carrying the correct `school_id`. One missing filter in one reporting query is a cross-tenant leak.

## Options considered

1. **Application scoping only** — relies entirely on developer discipline across every future query.
2. **Composite foreign keys only** — prevents cross-tenant _references_ but not cross-tenant _reads_.
3. **Composite FKs + RLS + generated isolation tests** — three independent layers.

## Decision

**Adopt all three layers.**

1. **Denormalised `school_id`** on every school-owned table, including the high-volume execution tables (`ExamAttempt`, `AttemptQuestionSnapshot`, `AttemptAnswer`), as the leading indexed column. This resolves `D-01`: deriving the tenant through four joins would make both RLS policies and ordinary scoped queries too expensive on the hot path.
2. **Composite foreign keys** carrying `school_id` on both sides, so a cross-tenant reference is rejected by the database.
3. **PostgreSQL Row-Level Security** with a session-scoped tenant variable set per request and per background job.

Plus a **generated tenant-isolation test suite** built from the route table, so a new endpoint cannot silently skip coverage.

Software Admin cross-tenant access runs through an explicit, audited path that sets the tenant variable deliberately — never by disabling RLS.

## Consequences

**Easier**

- A forgotten `school_id` filter fails closed instead of leaking.
- Background workers and exports inherit the same guarantee as request handlers.
- Retrofitting `school_id` onto tables holding tens of millions of rows is avoided entirely.

**Harder**

- Every request and job must set the tenant session variable; a missed one causes visible failure rather than silent leakage, which is the intended trade.
- RLS policies must be maintained alongside schema changes.
- Connection pooling must not leak session variables between requests — significant given [ADR-0032](./ADR-0032-aws-region.md) and the pooler introduced in B21.

**Required changes**

- B0: `school_id` convention with a schema lint, composite FK convention, RLS bootstrap and policy template, pooler-safe session variable handling.
- B2: generated cross-tenant suite wired as a merge blocker.
- B21: verify RLS overhead under load and confirm the pooler does not leak tenant context.

## Amendment — 2026-10-03 (B21)

B21 verified both items this ADR assigned to it ([capacity plan](../performance/capacity-plan.md) §7):

- **RLS overhead is negligible.** Every request sets the tenant inside its transaction
  (`set_config(…, true)`); at 1,000 attempts that call averaged 0.007 ms over ~350,000 calls, and no
  RLS-filtered statement was a hot spot.
- **The pooler does not leak tenant context.** The setting is transaction-local and every tenant
  query runs inside that transaction, so transaction pooling (PgBouncer locally, RDS Proxy in
  production) cannot carry it to another client.
  `tests/tenancy/pooler-tenant-isolation.integration.test.ts` proves it through PgBouncer in
  transaction mode. **B23:** confirm RDS Proxy does not pin sessions on this pattern
  (`DatabaseConnectionsCurrentlySessionPinned`).
