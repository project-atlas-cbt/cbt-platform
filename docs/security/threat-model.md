# Threat model

**Status:** B20 (2026-10-02) — DoD 12. Method: STRIDE per trust boundary, then a findings register
where every item is **remediated** (with the test that holds it) or **accepted** (with a recorded
rationale). Re-run this review whenever a new trust boundary appears (a new external integration, a
new host, a new credential type). A third-party penetration test is a deferred launch-readiness item.

## Assets

1. **Examination integrity** — attempt timing, answers, snapshots, marking, results (the product's
   core promise; 08 §17).
2. **Minors' personal data** and academic histories (NDPA; ADR-0028).
3. **Tenant separation** — one school can never see or change another's data (invariant 1).
4. **Administrative authority** — School Admin and, above all, Software Admin.
5. **Audit trail** — append-only evidence that all of the above held (invariant 15).

## Trust boundaries

```text
 Browser (student lab PC / staff / Software Admin)
    │  ① HTTPS, cookies (school: Domain=<root>; platform: host-only, Strict), CSRF token
    ▼
 Web (Vercel, Next.js)  ──②──►  API (Fastify/Nest, ECS)  ──③──► PostgreSQL (atlas_app, RLS)
                                    │                     ──③──► Redis (rediss)  ──► BullMQ
                                    │                     ──③──► S3 (presigned, per-school prefix)
                                    ▼
                                 Worker (ECS) ──③── same stores; ④ operator CLIs (ops:*)
```

① client ↔ edge · ② web ↔ API (same-site, CORS) · ③ services ↔ data stores · ④ operator access.

## STRIDE by boundary

| Boundary | Threat (STRIDE)                                      | Mitigation                                                                                                                                                                                              | Evidence                                                                                      |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ①        | **S**poofing — credential guessing / stuffing        | Argon2id; per-account lockout; per-account+IP and per-IP sign-in limits sized for a 40-PC lab; audit of sign-ins and lockouts; Software Admin TOTP                                                      | `http-surface…` (lab + spray), `sessions…`, `mfa…`                                            |
| ①        | **S** — session theft / fixation / replay            | Server-side revocable sessions (sha256 at rest); fresh token at login; rotation on refresh; revocation on password change/reset/credential reissue; platform cookie host-only + Strict + 8h/30-min idle | `sessions.security…`                                                                          |
| ①        | **T**ampering — CSRF                                 | Signed double-submit token bound to the school (or platform), own secret                                                                                                                                | `sessions.security…` CSRF, `csrf.integration.test.ts`                                         |
| ①        | **I**nformation disclosure — XSS-driven exfiltration | API CSP `default-src 'none'`; JSON only; uploads can't become HTML/SVG; web CSP is F20                                                                                                                  | `http-surface…`, `input-attacks…` uploads, [web-csp-policy.md](web-csp-policy.md)             |
| ②        | **S**/**T** — cross-origin abuse                     | CORS: exact web origin, or one well-formed label under the root; credentials only there                                                                                                                 | `http-surface…` CORS, `cors.test.ts`                                                          |
| ②        | **E**levation — role escalation                      | Default-deny route policy (boot check); permission table evaluated live per request; MFA gate                                                                                                           | `authorization-matrix…` (every route × every role)                                            |
| ②        | **I** — IDOR / cross-tenant read                     | Tenant from Host only; RLS on every school table; foreign ids indistinguishable from nonexistent                                                                                                        | `tenant-isolation…` (>1000 probes), `rls.integration.test.ts`, `db-privileges…` catalog check |
| ②        | **T** — injection                                    | Prisma parameterisation; global ValidationPipe (whitelist/forbid); UUID route-param pipe; body size limit                                                                                               | `input-attacks…`                                                                              |
| ②        | **D**enial of service — floods                       | Per-class rate limits keyed by session (not IP) so a lab is never throttled; 1 MB body cap; upload size caps                                                                                            | `http-surface…`                                                                               |
| ③        | **E** — SQL-level escalation if app is compromised   | `atlas_app`: no superuser/BYPASSRLS/DDL/TRUNCATE; no DELETE on evidence/audit/schools; no write to platform roles; no access to migration ledger                                                        | `db-privileges…`                                                                              |
| ③        | **I** — eavesdropping                                | Production boot refuses non-TLS Postgres (`sslmode`) and Redis (`rediss`); BullMQ connections now carry TLS/auth                                                                                        | `env.schema.test.ts`, `redis-connection.test.ts`                                              |
| ③        | **R**epudiation                                      | Append-only audit (trigger + REVOKE + RLS); platform-level rows for Software Admin; break-glass audit in the same transaction as the action; break-glass alerting                                       | `audit.integration.test.ts`, `mfa…` (platform rows), `break-glass.service.test.ts`            |
| ③        | **I** — secrets in logs                              | Redacting structured logger; scrubbed error serialisation; console email transport withholds content in production; health probe returns no error text                                                  | `log-hygiene…`, `logger.test.ts`, `console-channel.test.ts`                                   |
| ④        | **E**/**R** — operator misuse                        | Operator CLIs require a live Software Admin as actor, dry-run by default, audited; production shell access is itself controlled (B23)                                                                   | `subject-redaction.integration.test.ts`                                                       |
| all      | Supply chain                                         | `pnpm audit` (prod, high+) and Trivy fs + image scans block merges; gitleaks blocks; Dependabot; non-root container                                                                                     | CI `supply-chain`, `secret-scan`                                                              |

## Findings register

Found during B20's review and suites. **R** = remediated, **A** = accepted with rationale.

| #   | Finding                                                                                                                                         | Severity    | Status   | Where / test                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Console email transport printed live reset/activation links and recipients to stdout                                                            | High        | R        | `console-channel.ts` (withheld in production); `console-channel.test.ts`                                                                                     |
| 2   | Per-IP rate limiting + no `trustProxy`: a 40-student lab behind one NAT shared one 300/min bucket; behind the ALB, _every_ user would share one | High        | R        | `rate-limit.ts`, `TRUST_PROXY_HOPS`; `http-surface…` lab test                                                                                                |
| 3   | Sign-in throttle (10/min per IP) would have locked a lab out of an exam start                                                                   | High        | R        | per-account+IP and per-IP limits; `http-surface…`                                                                                                            |
| 4   | `atlas_app` could DELETE academic evidence/schools, write `platform_role_assignments`, read/write `_prisma_migrations`                          | High        | R        | `privileges.ts`, `grants.ts`; `db-privileges…`                                                                                                               |
| 5   | Idempotency cache keyed globally — a reused key could replay another caller's stored response                                                   | Medium      | R        | `idempotency.interceptor.ts` (scoped by school + principal, `SET NX`)                                                                                        |
| 6   | Break-glass audit written after the action committed (an action could succeed unaudited)                                                        | Medium      | R        | `break-glass.service.ts`; unit test                                                                                                                          |
| 7   | Password change/reset/credential reissue left other sessions alive                                                                              | Medium      | R        | `session.service.ts`; `sessions…`                                                                                                                            |
| 8   | Software Admin cookie sent to every school subdomain (Domain=<root>), 7-day life, no idle timeout, no MFA                                       | Medium      | R        | `platform-session.service.ts`, MFA; `sessions…`, `mfa…`                                                                                                      |
| 9   | ~80 id-bearing routes returned 500 on a malformed id (unvalidated cast)                                                                         | Medium      | R        | `uuid-route-param.pipe.ts`; `input-attacks…`                                                                                                                 |
| 10  | `GET /academics/classes?academicSessionId=<non-uuid>` → 500                                                                                     | Low         | R        | `ParseUUIDPipe`; `input-attacks…`                                                                                                                            |
| 11  | Declared `image/svg+xml`/`text/html` accepted at upload-request time (sniff still rejected later)                                               | Low         | R        | `media.service.ts`; `input-attacks…`                                                                                                                         |
| 12  | `/health/ready` returned raw DB/Redis error text publicly                                                                                       | Low         | R        | `health.controller.ts`                                                                                                                                       |
| 13  | Correlation id taken verbatim from the client (log forging / header abuse)                                                                      | Low         | R        | `correlation-id.middleware.ts`                                                                                                                               |
| 14  | BullMQ connections dropped Redis password and TLS                                                                                               | High (prod) | R        | `redis-connection.ts`                                                                                                                                        |
| 15  | `audit_events.school_id` declared `ON DELETE CASCADE` against immutability                                                                      | Low         | R        | B20 migration (RESTRICT)                                                                                                                                     |
| 16  | Production could boot with dev secrets / plaintext DB & Redis                                                                                   | High (prod) | R        | `env.schema.ts` production rules                                                                                                                             |
| 17  | Dependencies: 23 high + 3 critical advisories (fastify, Next.js, @fastify/static, image-size, transitive)                                       | High        | R        | upgrades + `pnpm-workspace.yaml` overrides; `pnpm audit:deps` gate                                                                                           |
| 18  | Gitleaks non-blocking; container ran as root                                                                                                    | Medium      | R        | CI, `Dockerfile.node`                                                                                                                                        |
| 19  | Child-collection routes answer `200 []` for a foreign parent id                                                                                 | Info        | A        | Indistinguishable from a nonexistent id (asserted), so no data and no existence oracle. Tightening to 404 is a product-wide API change, not a security gain. |
| 20  | Concurrent duplicates with the same idempotency key can both execute (first response wins the cache)                                            | Low         | A        | Every critical mutation is itself idempotent (answer sequence numbers, submit state machine, start advisory lock).                                           |
| 21  | API host vs. Host-header tenancy in production (ADR-0022 `api.<root>`)                                                                          | Medium      | A (B23)  | Already a recorded B23 item; B20 cannot change topology.                                                                                                     |
| 22  | Polyglot PNG (valid image + trailing bytes) is accepted                                                                                         | Low         | A        | Served only via signed S3 URL with an image content-type and `nosniff`; never rendered as HTML. Real malware scanning is a recorded candidate.               |
| 23  | Encryption at rest                                                                                                                              | —           | A (B23)  | An infrastructure property (RDS/S3/ElastiCache KMS) verified at provisioning; nothing for the app to enforce.                                                |
| 24  | Actions in CI pinned by tag, not SHA                                                                                                            | Low         | A        | Dependabot (github-actions) keeps them current; SHA pinning when the release process (B23) is set.                                                           |
| 25  | MFA for school roles; Software Admin password-change endpoint                                                                                   | —           | Deferred | Candidate/Deferred (project-owner scope for B20 was Software Admin MFA).                                                                                     |
| 26  | Moderate/low advisories remaining (1 low, 2 moderate)                                                                                           | Low         | A        | Below the HIGH gate; Dependabot will surface fixes.                                                                                                          |

## Residual risk

The largest remaining risks are operational, not code: production secret management and access to
production shells (B23), DNS/TLS for per-school subdomains (B23), and the absence of an external
penetration test before general availability.
