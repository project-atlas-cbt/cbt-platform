# Data Processing Agreement — template

> **DRAFT — LEGAL REVIEW REQUIRED.** Prepared by engineering in B20 (2026-10-02) to fix the
> technical and operational commitments the platform can actually honour. It is not legal advice and
> must be reviewed by counsel against the Nigeria Data Protection Act 2023 and current NDPC guidance
> before it is offered to any school (ADR-0028; launch-readiness item, B23). Bracketed items are to be
> completed per contract. The product's commercial name is set per contract — it is not fixed here.

**Between** [School legal name] ("the School", controller) **and** [Operator legal name] ("the
Processor").

## 1. Subject matter and duration

The Processor provides a computer-based testing service: question banks, examinations, attempts,
marking, results and reports. This agreement applies for the term of the service agreement and
until the return or redaction obligations in clause 9 are complete.

## 2. Nature and purpose of processing

Processing solely to deliver the service on the School's documented instructions. The Processor
does not process School data for its own purposes, does not sell it, profile students, show
advertising, or use it to train machine-learning models.

## 3. Categories of data and data subjects

Data subjects: the School's students (minors), teaching and administrative staff. Data: names,
school-issued identifiers (student/staff/admission numbers), staff email addresses, class and
subject placement, examination attempts and answers, results, and technical/security data (IP
address and device identifier at attempt start, sign-in records). No special-category data is
collected.

## 4. Processor obligations

The Processor will: act only on the School's documented instructions; ensure personnel are bound
by confidentiality; implement the security measures in Annex A; assist the School with data-subject
requests and with breach notifications (clause 7); make available information needed to
demonstrate compliance; and inform the School if an instruction appears unlawful.

## 5. Academic record (important)

The School acknowledges that **examination attempts, answers, question snapshots, results and the
audit trail form the School's academic record** and are retained for the term (see Annex B) and are
**never destroyed** on a data-subject request. On a verified request the Processor will instead
redact the person's identifying details (name, email, sign-in and student/staff identifiers) so the
record no longer identifies them, while keeping its academic integrity. Where one person is shared
with another school using the service, only this School's identifiers are redacted.

## 6. Sub-processors

The School authorises the sub-processors listed in Annex C. The Processor will give [30] days'
notice of any new sub-processor, during which the School may object.

## 7. Personal data breaches

The Processor will notify the School **without undue delay, and in any case within [24] hours of
confirming** a personal data breach affecting School data, with the information then available, so
the School can meet its own obligation to notify the Nigeria Data Protection Commission within 72
hours and, where required, data subjects. The Processor will document every breach and its
remediation.

## 8. International transfers

Data is hosted in [AWS eu-west-1 (Ireland)]. The parties will rely on [the transfer mechanism
counsel confirms under the NDPA] for this transfer.

## 9. End of service

At the end of the service the School may export its data. The Processor will then, at the School's
choice, [retain the academic record in read-only form for [N] years / return it / redact personal
identifiers from it], and delete operational data per Annex B.

## 10. Audit

The Processor will make available its security documentation and the results of independent
security testing [annually], and allow audits by the School or its mandated auditor on reasonable
notice.

---

### Annex A — Security measures

Tenant isolation enforced in the application and by database row-level security; least-privilege
database access that cannot delete academic records or alter the audit trail; encrypted transport
(TLS) for all traffic; salted, memory-hard password hashing; revocable sessions; two-factor
authentication for platform administrators; audited administrative and emergency ("break-glass")
access; rate limiting; secure headers; dependency and container vulnerability scanning on every
change; structured logs that exclude credentials, answer content and unnecessary personal data;
monitoring with alerting on examination health. Evidence: `docs/security/controls-evidence.md`.

### Annex B — Retention

As published in `docs/compliance/retention-schedule.md` at the date of signature.

### Annex C — Sub-processors

As listed in `docs/compliance/data-protection.md` §6 at the date of signature.
