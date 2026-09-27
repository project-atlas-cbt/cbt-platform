# Data Protection Posture

**Owner:** Company
**Status:** Draft for Nigerian counsel review before general availability
**Applies to:** All environments processing customer or student data

## Roles

- Each customer school is the **data controller**. It decides which student and staff records are
  created and the purposes for which they are used.
- The platform operator is the **data processor**. It processes school data only to provide,
  secure, support, and operate the contracted CBT service.
- Subprocessors must be listed in the executed DPA before production data is entrusted to them.

## Data classes

| Class                 | Examples                                           | Default handling                                          |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| Identity              | Names, admission/staff identifiers, account status | Restricted by tenant and role                             |
| Academic context      | Session, class, subject, enrollment                | Historical; never rewritten by current placement          |
| Academic evidence     | Attempts, snapshots, answers, marking, results     | Indefinite retention under ADR-0028; no ordinary deletion |
| Security evidence     | Audit events, integrity events, access metadata    | Append-only or tightly restricted                         |
| Operational artefacts | Sessions, reset tokens, idempotency keys           | Time-limited per retention schedule                       |
| Media/imports/exports | Logos, question media, staging files, reports      | Private storage; lifecycle-specific controls              |

## Processing principles

1. Purpose limitation: process data only for the contracted CBT service and its security.
2. Data minimisation: do not place answer content, credentials, cookies, or unnecessary PII in
   logs, metrics, traces, alerts, or error reports.
3. Tenant isolation: every school-owned operation is scoped by the current server-resolved tenant.
4. Least privilege: authorization is server-side and database roles cannot perform schema DDL.
5. Integrity and availability: academic evidence remains reconstructable and recoverable.
6. Storage limitation: operational artefacts expire; academic retention remains provisional until
   legal review and B21 storage measurements are complete.
7. Data residency: `eu-west-1` per ADR-0032. A Nigerian-residency requirement needs a new ADR.

## Lawful instructions and requests

The school validates the lawful basis and identity behind a data-subject request. The platform
executes the controller's documented instruction using
[`subject-rights-procedure.md`](./subject-rights-procedure.md). The platform does not independently
decide to erase a school's academic record.

## Security and incidents

Controls and evidence are tracked in
[`../security/control-evidence.md`](../security/control-evidence.md). Suspected personal-data
breaches follow [`breach-response.md`](./breach-response.md).

## Required approvals

- Nigerian privacy counsel must review the DPA, retention schedule, request procedure, breach
  timelines, data residency statement, and any statutory notification language.
- The project owner must approve all accepted threat-model risks.
- B21 measurements must inform any move away from indefinite academic retention.
