# ADR-0005 — Tenant resolution at login

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** A-01 (BLOCKER), R-02
**Blocks phases:** B0, B1, F0, F1

## Context

`04 §2` specifies a login screen carrying the school's logo and primary colour — which is impossible to render before the school is known. `07 §5.1` places `login_identifier` on `User`, which is tenant-independent, while student IDs such as `ST001` (`03 §15`) are issued per school and are only unique within one. Two schools will both have an `ST001`.

No specification states how a login request resolves to a school. Four incompatible designs satisfied the text, each producing a different `User` unique constraint, session shape, and DNS strategy.

## Options considered

1. **Per-school subdomain** — `greenfield.atlas.app`. Resolves the tenant before authentication. Requires wildcard DNS and TLS.
2. **School code on the login form** — one domain, user supplies a code. No wildcard infrastructure, but the login screen starts unbranded.
3. **Invitation/bookmark link** — `atlas.app/s/greenfield`. Single domain, branded, but weaker as a commercial identity.
4. **Global uniqueness of `login_identifier`** — rejected outright: it breaks school-issued student IDs.

## Decision

**Per-school subdomain.**

- Each school is provisioned a subdomain derived from its `school_code`.
- The subdomain resolves the tenant at the edge, before authentication.
- `login_identifier` is unique **per school**, not globally.
- Software Admin authenticates at a distinct platform host with platform branding, per `04 §2`.
- `GET /v1/tenant/resolve` returns branding only — never user existence, never counts — and is rate-limited.

## Consequences

**Easier**

- `04 §2`'s branded login works with no extra step.
- Genuinely same-site cookies become available, which is why [ADR-0022](./ADR-0022-cross-origin-session-strategy.md) resolves as it does.
- Each school gets a credible commercial identity.

**Harder**

- Wildcard DNS and wildcard TLS must be provisioned in B0 and B23.
- Subdomain allocation, collision handling, and reservation become part of school creation (B3).
- Local and preview environments need subdomain support, which complicates F0's dev setup.

**Required changes**

- B0: wildcard DNS/TLS, edge tenant resolution, subdomain-aware local dev.
- B1: `login_identifier` unique per school; `GET /v1/tenant/resolve`.
- B3: subdomain allocation and validation at school creation.
- F1: resolve tenant and apply branding before rendering login.

## Amendment — 2026-10-15: short school addresses, chosen at creation

**Context:** the address was the full school name, hyphenated (`05 §3.2`'s "System generates:
School identifier"), so the pilot school's would have been
`our-lady-of-apostles-maryway-odo-ona-ibadan`, far too long to type every day.

**Decision (project owner, 2026-10-15):**

- The Create school form suggests short addresses from the name (initials first: `ola`), and the
  Software Admin may edit the suggestion. The API accepts an optional `subdomain`; without one it
  uses the best free suggestion.
- A new address is 3 to 20 lowercase letters, digits and single hyphens
  (`@atlas/domain` `school-address.ts`). Platform hosts, likely future hosts, mail and support
  names and the product name are reserved (`SCHOOL_ADDRESS_RESERVED`). Only the original four
  platform labels stop a host resolving, so growing the reserved list never breaks a school.
- The form checks availability as the admin types (`GET /v1/platform/schools/address-availability`,
  `/address-suggestions`); the unique index on `School.subdomain` settles a race, answered as
  `409 CONFLICT` with `details.reason = TAKEN`.
- An address is never reused: schools are never deleted (B20 grants) and the address cannot be
  changed, so an archived or deactivated school keeps its address and old links never reach
  another school. Existing schools keep their addresses, whatever their length.
