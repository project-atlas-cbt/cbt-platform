# ADR-0027 — Timezone policy

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** M-12 (HIGH)
**Blocks phases:** B0

## Context

Timestamps are load-bearing throughout: `started_at`, `expires_at`, `submitted_at`, session and term boundaries, subscription expiry. No specification states a timezone policy.

The exam engine is the sharp edge. `expires_at` must be computed and compared in one unambiguous frame, and the student's countdown must derive from the server's expiry rather than local device time (`08 §11.4`, `09 §7`).

The initial market is Nigeria (WAT, UTC+1, no DST), but the platform is multi-tenant and commercial, and `01 §9` already contemplates usage by region.

## Options considered

1. **Store UTC, render per school timezone** — unambiguous storage, correct display.
2. **Store WAT throughout** — simplest for one market, wrong the moment a second timezone appears.
3. **Store UTC, render UTC** — unambiguous but unusable for school staff.

## Decision

**Store UTC, render per school.**

- Every timestamp column is `timestamptz`, stored UTC.
- `School` carries a configurable IANA timezone, defaulting to `Africa/Lagos`.
- All school-facing times render in the school's timezone.
- The API never accepts or emits a naive local timestamp.
- **Client-supplied timestamps are never used for admissibility decisions** — see [ADR-0003](./ADR-0003-post-expiry-cutoff-policy.md). Server receipt time governs.
- The student countdown derives from a server-provided remaining-seconds value decremented against a monotonic clock, never wall-clock time (resolves `X-08`).

## Consequences

**Easier**

- Timer arithmetic has one frame of reference.
- Adding a school in a different timezone requires no migration.
- Device clock manipulation cannot affect correctness.

**Harder**

- Every display path must apply the school timezone; a missed one shows UTC to a user.
- Academic date boundaries (session start, term end) need a defined convention for which timezone's midnight applies — resolved as the school's.

**Required changes**

- B0: `timestamptz` convention, timezone rendering utility, lint against naive timestamps.
- B3: school timezone field, defaulting to `Africa/Lagos`.
- B13: countdown derived from server remaining-seconds against a monotonic clock.
- F0: timezone-aware formatting in the shared component library.
