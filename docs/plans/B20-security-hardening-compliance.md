# B20 — Security Hardening & Compliance Implementation Plan

**Branch:** `feat/b20-security-hardening-compliance`
**Status:** Implemented; in review
**Governing decision:** ADR-0028
**Dependencies:** B1–B19

## 1. Objective

Bring the implemented platform to a production-security baseline and establish the documented
data-protection posture required for a processor of minors' academic records. B20 is cross-cutting:
it hardens the existing system rather than introducing a new product domain.

## 2. Source-of-truth checklist

- `AGENTS.md` §§4–10, 17, 20
- `PROJECT.md`
- `CLAUDE.md`
- `docs/roadmaps/backend-roadmap.md` — B20
- `docs/decisions/ADR-0028-data-protection-and-retention.md`
- `docs/08-technical-architecture.md` §§16–18
- `docs/09-technology-selection-and-technical-stack-evaluation.md` §§35–37
- `docs/02-roles-permissions.md` §§5–6
- `docs/07-erd-state-transitions.md` §42 invariants 1, 14, and 15
- `docs/audit/specification-audit.md` findings M-13 and M-14
- `docs/roadmaps/frontend-roadmap.md` — F20 security-header integration boundary

## 3. Confirmed constraints

1. The school is controller and the platform is processor.
2. Academic evidence is retained indefinitely under the current provisional policy. B20 must not
   introduce destructive deletion of attempts, answers, snapshots, results, audit events, or
   historical academic context.
3. Subject-access and deletion handling may export data and de-identify mutable identifiers, but
   may not destroy the school's academic record.
4. Audit events remain append-only and inaccessible to ordinary update/delete operations.
5. Orphaned media remains report-only until a legally approved destructive schedule exists.
6. B21 owns measured storage growth and the final load profile. B20 may define safe defaults but
   must not claim B21 validation.
7. Third-party penetration testing and formal certification remain B23 launch-readiness work.

## 4. Workstreams

### A. Security baseline and HTTP hardening

- Centralise production-safe Helmet configuration.
- Apply CSP and the remaining browser-facing security headers in the Next.js tier.
- Preserve local-development compatibility while requiring HTTPS/HSTS in production.
- Tune endpoint-class rate limits: authentication strict, mutation/admin bounded, answer sync
  permissive enough for normal autosave bursts.
- Verify upload type/size validation, private object storage, CSRF, session rotation, and secret
  validation; record evidence and any accepted residual risk.

### B. Observability and log hygiene

- Initialise OpenTelemetry and optional Sentry integrations from validated environment variables.
- Add spans for start-attempt, answer-sync, submit, and result generation/marking.
- Add structured request logs containing correlation id, safe tenant id, method, route, status, and
  duration—never request bodies, credentials, answer content, or student names.
- Replace worker free-text error logging with the same redacted structured format.
- Emit the B20 exam-health metrics and maintain a bounded answer-save health window.

### C. Exam Health Monitor

- Record answer-save success/failure and latency without recording answer content.
- Evaluate the rolling success rate only after a minimum sample count.
- Raise a deduplicated operational alert when the configured threshold is crossed.
- Exercise the alert path under simulated degradation in an automated test.

### D. Least privilege and retention execution

- Reassert application-role grants after migrations and explicitly revoke update/delete/truncate on
  `audit_events`.
- Add an automated database-role test proving the application role cannot alter audit history or
  schema objects.
- Implement a scheduled retention job limited to approved ephemeral operational records.
- Keep protected academic/audit data and orphaned media report-only.
- Make retention decisions explicit, observable, idempotent, and tenant-safe.

### E. Compliance documentation

- Controller/processor and data-protection posture.
- Standard DPA template for legal review.
- Subject-access, correction, de-identification, and deletion-request procedure.
- Breach-response and notification procedure.
- Retention schedule and record-class matrix.
- Completed threat model and security-control evidence matrix.
- Explicit legal-review and B21 measurement gates; do not represent templates as legal advice.

### F. Security verification and CI

- Make secret scanning blocking instead of advisory.
- Add dependency vulnerability scanning that blocks high/critical findings.
- Add container/filesystem vulnerability scanning that blocks high/critical findings.
- Add security tests for headers/CSP, correlation/log redaction, rate-limit classes, audit
  immutability, retention protection, health-monitor alerting, and authorization-policy coverage.
- Reuse the existing endpoint policy-coverage and RLS suites; extend rather than duplicate them.

## 5. Validation order

1. Unit tests for configuration, headers, logging/redaction, metrics, and retention classification.
2. API/worker typecheck and lint.
3. Focused integration tests against PostgreSQL, Redis, and MinIO.
4. OpenAPI generation and contract-drift check.
5. Full `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
6. Full `pnpm test:integration`.
7. Security CI definitions reviewed for blocking semantics.

If the local environment cannot provide Docker, complete steps 1, 2, 4, and 5 locally and leave
PostgreSQL/Redis/MinIO-backed verification to the pushed branch's CI. That limitation must remain
visible in completion reporting.

## 6. Completion evidence

B20 can be marked complete only when each roadmap Definition-of-Done item has a concrete code,
test, document, or CI reference in `docs/security/control-evidence.md`. Items requiring legal
approval, B21 load measurements, or an external penetration test remain explicit gates rather than
being silently self-certified.
