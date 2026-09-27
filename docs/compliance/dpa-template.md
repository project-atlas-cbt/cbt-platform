# Data Processing Agreement — Review Template

> **Not legal advice.** This engineering template implements ADR-0028's allocation of responsibilities
> and must be reviewed and completed by qualified Nigerian counsel before execution or general
> availability.

## Parties and roles

- **Controller:** `[School legal name and address]`
- **Processor:** `[Platform operator legal name and address]`
- **Effective date:** `[date]`

The Controller determines the purposes and means of processing school, staff, and student data. The
Processor processes that data only on documented Controller instructions necessary to provide and
secure the CBT service.

## Processing details

- **Subject matter:** Operation of a multi-tenant school examination/CBT platform.
- **Duration:** The service term plus the approved return, de-identification, and retention periods.
- **Data subjects:** Students (including minors), staff, school administrators, and authorized
  platform operators.
- **Data:** Identity and contact data; admission/staff identifiers; academic structure; questions;
  attempts, answers, results, participation, and audit/security events.
- **Purposes:** Authentication, examination administration, marking, publication, reporting,
  support, security, continuity, and legally required processing.

## Processor commitments

1. Process personal data only on documented Controller instructions.
2. Ensure authorized personnel are bound by confidentiality.
3. Maintain the technical and organizational measures referenced in the security schedule.
4. Assist the Controller with verified data-subject requests.
5. Notify the Controller of a suspected personal-data breach without undue delay under the
   counsel-approved incident procedure.
6. Maintain a current subprocessor schedule and required contractual protections.
7. make information reasonably necessary to demonstrate compliance available to the Controller.
8. Return or de-identify mutable identifiers at termination as instructed, subject to the academic
   evidence and legal-retention provisions below.

## Academic-record preservation

The parties acknowledge that attempts, answer events, immutable snapshots, marking evidence,
results, adjustments, publication history, and audit evidence are school academic records. A
request to erase or de-identify personal identifiers does **not** authorize destruction of that
evidence. Where approved by the Controller and counsel, identifiers may be replaced with a stable
pseudonym while referential integrity and auditability remain intact.

## Security schedule

At minimum: encrypted transport; managed encryption at rest; tenant isolation; server-side
authorization; revocable sessions; Argon2id password hashing; CSRF protection; rate limiting;
private object storage; append-only audit events; vulnerability scanning; monitored critical exam
flows; incident response; backups and recovery testing.

## Retention and deletion schedule

The schedule in [`retention-schedule.md`](./retention-schedule.md) applies only after counsel and
both parties approve it. Academic evidence is retained indefinitely under the current provisional
policy. Operational authentication artefacts are deleted after their stated safety window.

## Subprocessors and transfers

List each production subprocessor, service, location, purpose, and transfer mechanism:

| Subprocessor | Service | Location | Purpose | Approved |
| ------------ | ------- | -------- | ------- | -------- |
| `[TBD]`      | `[TBD]` | `[TBD]`  | `[TBD]` | `[date]` |

## Required completion before execution

Counsel must add governing law, statutory citations, liability, audit mechanics, notification
deadlines, Controller contact, Processor contact, data-return format, termination process, signature
blocks, and any required Nigeria Data Protection Act/NDPR clauses.
