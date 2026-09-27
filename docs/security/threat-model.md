# B20 Threat Model

**Method:** STRIDE-informed abuse-case review
**Status:** Engineering review complete; accepted residual risks require project-owner approval

## Assets and trust boundaries

- Minors' identity and academic records
- Credentials, sessions, reset tokens, and activation grants
- Questions and correct-answer material
- Attempt timers, snapshots, answer events, marking, and results
- Audit history, exports, media, queues, caches, and backups
- Boundaries: browser/API, school tenant, platform operator, PostgreSQL, Redis, object storage,
  background workers, observability vendors, and CI/CD

## Principal threats and controls

| Threat                          | Impact                          | Primary controls                                                                         | Residual action                                 |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Cross-tenant IDOR/reference     | Critical disclosure or mutation | Server-resolved tenant, composite FKs, FORCE RLS, scoped authorization                   | Full endpoint suite remains a merge gate        |
| Role/scope escalation           | Unauthorized academic action    | Permission engine, ownership/department/assignment scope, audited break-glass            | Maintain policy-coverage test                   |
| Session theft/fixation/replay   | Account takeover                | HttpOnly same-site cookies, rotation/revocation, CSRF, lockout, TLS                      | B23 edge/TLS verification                       |
| Answer-key leakage              | Exam compromise                 | Student DTO projection, private media, contract tests                                    | Re-run release-blocking X-05 test               |
| Answer loss/reordering          | Invalid results                 | Sequenced atomic upsert, append-only events, server receipt time                         | B21/B22 load and recovery validation            |
| Audit tampering                 | Loss of accountability          | DB trigger; runtime role SELECT/INSERT only; no schema CREATE                            | Privilege integration test                      |
| Malicious upload                | Stored attack or code execution | Presigned isolated upload, MIME sniffing, dimensions/size validation, private bucket     | Production malware scanner remains B23 decision |
| Export theft                    | Bulk PII disclosure             | Role-scoped generation, requester-bound short-lived capability, private object streaming | B22/B23 artefact deletion verification          |
| Log/telemetry leakage           | Secondary disclosure            | Metadata-only structured logs; Sentry scrubber; no bodies/queries/cookies                | CI/static review for logging call sites         |
| Dependency/container compromise | Remote execution/supply chain   | Frozen lockfile, build-script allowlist, blocking audit and Trivy, secret scanning       | Patch exceptions require recorded rationale     |
| Exam degradation/outage         | Lost assessment continuity      | Offline client, idempotency, queues, health metrics, answer-success alert                | B21 capacity and B22 failure testing            |
| Privileged operator abuse       | Cross-school exposure           | Read-only default, reason-bearing break-glass, append-only audit                         | Operational access review before GA             |

## Accepted/deferred risks

- Formal third-party penetration test and certification: B23 launch-readiness item.
- Production malware scanning: not implemented; current uploads are validated and isolated.
- Final academic/audit retention duration: pending legal review and B21 measurements.
- Production DNS/TLS, secret-manager policy, backup encryption evidence, and provider access reviews:
  B23 infrastructure evidence.

No high-severity engineering finding is accepted silently. Any newly discovered high/critical issue
blocks release until remediated or explicitly accepted by the project owner with scope, expiry, and
compensating controls.
