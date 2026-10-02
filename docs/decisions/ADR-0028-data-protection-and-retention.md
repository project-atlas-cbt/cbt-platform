# ADR-0028 — Data protection posture and retention

**Status:** Accepted (retention schedule formalised in B20 — see the 2026-10-02 amendment; legal review carried to B23 as a launch-readiness item)
**Date:** 2026-08-24
**Deciders:** Project owner, engineering takeover review
**Audit findings:** M-13 (MEDIUM), M-14 (MEDIUM)
**Blocks phases:** B20

## Context

The platform stores personal data about **minors** at scale — names, admission numbers, class placement, and complete academic performance histories — for Nigerian schools, bringing the Nigeria Data Protection Act and NDPR into scope. No specification mentions data protection, lawful basis, subject-access requests, breach notification, or a data-processing agreement.

`08 §16` covers security controls well, but security controls and a data-protection posture are different things, and the latter is a commercial prerequisite: schools will ask for a DPA before signing.

`07 §3.3` refers to _"data explicitly covered by a future retention policy"_ — a forward reference to a policy that does not exist. `03 §80` implies indefinite retention.

## Decision

### Posture

- **The school is the data controller; the platform is the processor.** Schools decide what student data exists; the platform processes it on their instruction.
- A standard **DPA** is produced before general availability.
- **Subject-access and deletion requests** are handled in a way that respects `07 §42` invariant 14: personal identifiers may be redacted or anonymised on request, but **academic evidence — attempts, answers, snapshots, results — is never destroyed**, because it is the school's academic record, not the platform's to delete. The DPA states this explicitly so it is agreed rather than discovered.
- Breach notification procedures documented in B20.

### Retention — provisional

**Retain all academic data indefinitely** for now, consistent with `03 §80`'s five-year test and invariant 14.

- Chosen because deletion is irreversible and the cost is currently unknown; the tiered alternative (archiving raw evidence after ~3 years) can be adopted later without data loss, whereas premature deletion cannot be undone.
- Storage growth is measured in B21, so the cost of this position is known rather than assumed.
- The **formal retention schedule is set in B20 with legal input**, informed by that measurement.
- Orphaned media (`D-13`) is **reported, not deleted**, until the schedule exists.

### Data residency

`eu-west-1` per [ADR-0032](./ADR-0032-aws-region.md). If a school or regulator requires Nigerian residency, that is a material change requiring its own ADR.

## Consequences

**Easier**

- A defensible procurement answer, and no irreversible deletion decisions taken under uncertainty.
- Academic integrity invariants are preserved by design rather than negotiated per request.

**Harder**

- Storage grows monotonically; the largest tables are snapshots, answers and answer events ([ADR-0007](./ADR-0007-answer-persistence-model.md), [ADR-0008](./ADR-0008-snapshot-storage-shape.md)).
- Indefinite retention of minors' data may itself attract regulatory scrutiny — precisely why B20's legal review is a gating item, not optional.
- Data residency could become a commercial blocker with a government or regulator customer.

**Required changes**

- B20: DPA; controller/processor documentation; subject-access and breach procedures; retention schedule with legal input; log hygiene.
- B21: measure storage growth to inform the schedule.
- B23: DPA available before general availability.

---

## Amendment — 2026-10-02 (B20)

Project-owner decisions taken at B20, recorded here rather than rewriting the decision above:

1. **Retention schedule formalised** (resolves M-14): academic evidence, audit and people records
   are retained indefinitely; only operational data is purged or redacted on fixed periods —
   [docs/compliance/retention-schedule.md](../compliance/retention-schedule.md), machine-readable as
   `RETENTION_SCHEDULE` (`packages/domain`), executed by the worker's daily retention sweep. The
   protection is structural, not procedural: the runtime database role holds no `DELETE` on any
   academic-evidence, audit or `schools` table (`packages/db/src/privileges.ts`).
2. **Legal review is a launch-readiness item**, not a B20 gate: the schedule, the posture and the DPA
   are reviewed by counsel before general availability (B23). Engineering could not supply that
   input; the decision is that the safe, irreversible-nothing schedule ships now and the review may
   shorten operational periods or add archival tiers later without data loss.
3. **Data-subject redaction is tooling, not just procedure**: an audited operator command
   (`ops:redact-subject`, dry-run by default) removes personal identifiers and never touches academic
   evidence — [docs/compliance/data-protection.md](../compliance/data-protection.md) §4.
4. **Posture documents produced**: controller/processor roles, data inventory, data-subject and
   breach procedures ([data-protection.md](../compliance/data-protection.md)) and a draft DPA marked
   for legal review ([dpa-template.md](../compliance/dpa-template.md)).
5. **Orphaned media stays report-only** until B21's storage measurements inform a rule (unchanged).

Status line above is unchanged in substance: the schedule is now formal, with legal review carried
to B23.
