# ADR-0022 — Cross-origin session strategy

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** R-02 (BLOCKER)
**Blocks phases:** B0, B1, F1

## Context

`09 §28` places the Next.js web application on Vercel and the NestJS API on AWS — two different origins. `09 §24` requires browser sessions that are `HttpOnly`, `Secure`, `SameSite-appropriate`, and rotatable.

"SameSite-appropriate" is where the difficulty hides. A cookie set by an AWS API host and sent from a Vercel-hosted origin is a cross-site cookie requiring `SameSite=None; Secure`, which carries CSRF exposure and faces increasingly aggressive browser restrictions on third-party cookies.

The constraint that decides this: **the student CBT client must survive a page refresh mid-attempt with its session intact** (`03 §36`, `05 §36`). An in-memory bearer token loses the session on refresh unless a silent-refresh path works reliably — including on the unstable networks the product is explicitly designed for.

## Options considered

1. **Shared parent domain, API on a sibling subdomain** — cookies are genuinely same-site.
2. **Proxy API calls through Next.js route handlers** — adds a hop and undermines `09 §29`'s reasoning for keeping the API off serverless.
3. **In-memory bearer tokens** — loses `HttpOnly` protection and complicates refresh for a client that must survive refresh mid-exam.
4. **Cross-site cookies with `SameSite=None`** — works today, but depends on third-party cookie behaviour that is actively being restricted.

## Decision

**Shared parent domain with the API on a sibling subdomain.**

Given [ADR-0005](./ADR-0005-tenant-resolution-at-login.md)'s per-school subdomains, the topology is:

```text
greenfield.atlas.app       → web (Vercel)
api.atlas.app              → API (AWS)
admin.atlas.app            → platform web
```

- Session cookies are set on the parent domain, scoped `Secure`, `HttpOnly`, `SameSite=Lax`.
- CSRF protection via the double-submit pattern on state-changing requests.
- Sessions are server-side and revocable; refresh rotates the session.
- Roles are **never** read from a token — authorization always re-reads live database state (`09 §25`).

## Consequences

**Easier**

- Refresh mid-exam preserves the session with no silent-refresh machinery — the requirement that drove the decision.
- `HttpOnly` is retained, so no token is reachable from JavaScript.
- No dependence on third-party cookie behaviour.

**Harder**

- Web and API must share a registrable parent domain; they cannot sit on unrelated hosts.
- CSRF protection is now mandatory on every state-changing endpoint.
- Vercel must serve the web tier under the shared parent domain, requiring domain delegation.

**Required changes**

- B0: cookie and CORS configuration, CSRF middleware, domain plan.
- B1: session issuance, rotation, revocation on the shared parent domain.
- F1: refresh-persistence test as an explicit Definition-of-Done item.
- B23: production DNS reflecting this topology.
