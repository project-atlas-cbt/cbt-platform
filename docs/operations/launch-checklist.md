# Launch checklist and go/no-go

**Status:** B23 (2026-10-04), DoD 10. Each item names who closes it and the evidence to record.
"Claude" items are done on staging from a Claude session; "Haneef" items need the owner, an
account, a person or a contract. Tick an item only with its evidence linked.

## 1. Accounts, domain and decisions

| #   | Item                                                                                            | Owner  | Evidence                                                    |
| --- | ----------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| 1.1 | Commercial product name and root domain chosen (`PROJECT.md`)                                   | Haneef |                                                             |
| 1.2 | AWS accounts for staging and production; af-south-1 enabled on both                             | Haneef |                                                             |
| 1.3 | Staging credentials available to the Claude environment (staging only)                          | Haneef |                                                             |
| 1.4 | Domain's nameservers at Vercel; DNS records per [infrastructure.md](infrastructure.md) step 6   | Haneef |                                                             |
| 1.5 | SES out of the sandbox in af-south-1; DKIM verified; SPF and DMARC published                    | Haneef |                                                             |
| 1.6 | Sentry project created; `SENTRY_DSN` set in both GitHub environments                            | Haneef |                                                             |
| 1.7 | On-call addresses decided and SNS subscriptions confirmed; paging tool chosen or email accepted | Haneef |                                                             |
| 1.8 | GitHub `production` environment: Haneef required reviewer, tags `v*` only                       | Haneef |                                                             |
| 1.9 | Open HIGH findings M-08/M-09 (invigilator signals) resolved or deferral recorded                | Haneef | [blocker-high-closure.md](../audit/blocker-high-closure.md) |

## 2. Staging (mirrors production, non-production data)

| #    | Item                                                                                                                                 | Owner  | Evidence |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------- |
| 2.1  | Staging provisioned from `infra/cdk` (bootstrap, first migration, services healthy)                                                  | Claude |          |
| 2.2  | Encryption at rest verified (RDS, cache, S3, proxy TLS) — the commands in infrastructure.md step 9                                   | Claude |          |
| 2.3  | Deploy on merge to `dev` runs green, including smoke and golden path (DoD 3, 5)                                                      | Claude |          |
| 2.4  | Rollback rehearsed: A → B → rollback to A → golden path → B                                                                          | Claude |          |
| 2.5  | Migration forward and rollback rehearsed on a production-sized anonymised dataset ([migrations.md](migrations.md))                   | Claude |          |
| 2.6  | Load level 1,000 for one hour from an off-host generator, start/submit bursts, endurance (B21 gate, R-03)                            | Claude |          |
| 2.7  | RDS Proxy pinning check under load (no sustained pinning)                                                                            | Claude |          |
| 2.8  | Multi-AZ RDS failover measured during load; ElastiCache failover measured (B22)                                                      | Claude |          |
| 2.9  | PITR restore time on a production-sized dataset (RTO ≤ 60 min) with `ops:restore-verify` (B22)                                       | Claude |          |
| 2.10 | S3 versioning and 35-day noncurrent expiry confirmed on the real bucket; restore IAM exercised (B22)                                 | Claude |          |
| 2.11 | Alarms fire and reach on-call (induce 5xx and a stopped worker)                                                                      | Claude |          |
| 2.12 | Exam Health Monitor email arrives through SES                                                                                        | Claude |          |
| 2.13 | Game day: runbooks followed by someone who did not write them ([on-call-and-incident-response.md](on-call-and-incident-response.md)) | Haneef |          |

## 3. Production

| #   | Item                                                                                     | Owner  | Evidence |
| --- | ---------------------------------------------------------------------------------------- | ------ | -------- |
| 3.1 | Production provisioned and first release deployed (Haneef applies)                       | Haneef |          |
| 3.2 | Encryption at rest verified in production                                                | Haneef |          |
| 3.3 | Smoke passes against production                                                          | Haneef |          |
| 3.4 | First automated backup present; one restore to a scratch instance verified (DoD 7)       | Haneef |          |
| 3.5 | First Software Admins created with `ops:create-software-admin`; TOTP enrolled            | Haneef |          |
| 3.6 | Web tier live on Vercel with nonce CSP, `NEXT_PUBLIC_MEDIA_ORIGIN` = bucket origin (F21) | F21    |          |

## 4. Legal and data protection (B20 carry-over)

| #   | Item                                                                  | Owner  | Evidence |
| --- | --------------------------------------------------------------------- | ------ | -------- |
| 4.1 | Legal review of the retention schedule and DPA (ADR-0028 amendment)   | Haneef |          |
| 4.2 | Long-term academic records snapshot proposal reviewed with 4.1 (B22)  | Haneef |          |
| 4.3 | Cross-region backup copy decided (B22)                                | Haneef |          |
| 4.4 | Proposed log retention (30 days staging, 90 days production) accepted | Haneef |          |

## 5. Product readiness

| #   | Item                                                                                             | Owner  | Evidence |
| --- | ------------------------------------------------------------------------------------------------ | ------ | -------- |
| 5.1 | B19's roadmap section closed                                                                     | Claude |          |
| 5.2 | Browser suites cover F16, F18 and F19 flows                                                      | F21    |          |
| 5.3 | F20 manual checks: NVDA, Chrome/Edge 111 and Firefox 115 ESR on Windows 7, a real low-end lab PC | Haneef |          |
| 5.4 | Password-reset and activation links point at the school's own host, not the root (see F21 notes) | F21    |          |
| 5.5 | User guides for each role (F21)                                                                  | F21    |          |

## 6. Pilot (DoD 11)

| #   | Item                                                                             | Owner  | Evidence |
| --- | -------------------------------------------------------------------------------- | ------ | -------- |
| 6.1 | Pilot school onboarded ([school-onboarding.md](school-onboarding.md))            | Haneef |          |
| 6.2 | Lab prepared and practice sitting run ([lab-preparation.md](lab-preparation.md)) | Haneef |          |
| 6.3 | A real examination conducted end to end; results published                       | Haneef |          |
| 6.4 | Pilot findings recorded and every BLOCKER/HIGH one addressed                     | both   |          |

## Go/no-go review

Held before general availability, after section 6. Copy this block into a dated file under
`docs/operations/launch/` and fill it in.

```text
Date:                 Attendees:
Release tag:          Commit:

1. Checklist: every item ticked with evidence, or listed below as an accepted exception.
   Exceptions (item, why acceptable, owner, due date):

2. Audit: no BLOCKER/HIGH finding open (docs/audit/blocker-high-closure.md), or owner-recorded deferral:

3. Pilot: date, school, students, attempts submitted, incidents, findings and their status:

4. Last 7 days on staging and production: alarms, incidents, error rate, p95 answer save:

5. Exam calendar for the first two weeks, and on-call cover for each sitting:

6. Rollback: the last known-good tag and confirmation it was rehearsed:

Decision: GO / NO-GO          Decided by: Haneef
Conditions or follow-ups:
```
