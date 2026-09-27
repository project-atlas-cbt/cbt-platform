# B20 Security Control Evidence

| Roadmap control                | Implementation/evidence                                                                   | Status                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Password hashing and lifecycle | `PasswordService` Argon2id; forced change/reset/lockout tests                             | Implemented before B20; re-reviewed                             |
| Revocable sessions             | `SessionService`, platform session service, rotation/revocation tests                     | Implemented before B20; re-reviewed                             |
| Server authorization           | Permission guard, policy-coverage suite, role/scope integration tests                     | Implemented; full endpoint matrix remains CI evidence           |
| Tenant isolation               | Request tenant resolution, composite FKs, FORCE RLS, tenancy tests                        | Implemented; full endpoint probe remains merge gate             |
| Upload isolation               | `MediaService`, content sniffing, size/dimension checks, private MinIO/S3                 | Implemented; production malware scanner deferred                |
| Rate limiting                  | Redis global limiter; strict auth; bounded start/submit; permissive answer-sync class     | Implemented                                                     |
| HTTP/browser headers           | API Helmet; nonce-based web CSP; HSTS production-only; COOP/referrer/permissions policy   | Implemented                                                     |
| Correlation and safe logs      | `RequestLoggingInterceptor`, `structuredLog`; metadata-only whitelist                     | Implemented                                                     |
| Critical traces                | `exam.start_attempt`, `exam.answer_sync`, `exam.submit_attempt`, `exam.result_generation` | Implemented; collector verification needs deployed environment  |
| Error tracking                 | Optional Sentry initialization with PII/body/cookie/query scrubbing                       | Implemented; DSN/deployed verification pending                  |
| Exam Health Monitor            | Rolling Redis answer-save success window, threshold/cooldown alert, OTel metric           | Implemented; simulated degradation unit test passes             |
| Dependency scanning            | Blocking `pnpm audit --audit-level high` CI job                                           | Implemented                                                     |
| Container scanning             | Blocking Trivy HIGH/CRITICAL image scan                                                   | Implemented                                                     |
| Secret scanning                | Gitleaks is blocking                                                                      | Implemented                                                     |
| Audit immutability             | DB trigger plus runtime role SELECT/INSERT only; CREATE revoked                           | Implemented; PostgreSQL integration check added, CI run pending |
| Retention execution            | Scheduled worker deletes expired sessions/reset tokens only                               | Implemented; PostgreSQL integration check added, CI run pending |
| Controller/processor posture   | `docs/compliance/data-protection-posture.md`                                              | Draft pending counsel                                           |
| DPA                            | `docs/compliance/dpa-template.md`                                                         | Draft pending counsel                                           |
| Subject rights                 | `docs/compliance/subject-rights-procedure.md`                                             | Draft pending counsel                                           |
| Breach response                | `docs/compliance/breach-response.md`                                                      | Draft pending counsel                                           |
| Retention schedule             | `docs/compliance/retention-schedule.md`                                                   | Provisional pending counsel/B21                                 |
| Threat model                   | `docs/security/threat-model.md`                                                           | Engineering complete; owner acceptance pending                  |

## Explicit gates

B20 must not be represented as fully complete until:

1. Nigerian counsel approves or amends the DPA, retention schedule, subject-rights procedure, and
   breach-notification obligations.
2. PostgreSQL/Redis/MinIO integration and simulated health-degradation tests pass in CI.
3. The project owner accepts documented residual risks.
4. No blocking high/critical dependency or container findings remain.
