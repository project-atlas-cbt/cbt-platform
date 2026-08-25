# ADR-0008 — Attempt snapshot storage shape

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** R-05 (HIGH), D-05 (MEDIUM), A-08 (HIGH)
**Blocks phases:** B13

## Context

`07 §9.2` lists `AttemptQuestionSnapshot`'s attributes without committing to a storage shape. The volume is significant: one snapshot per question per attempt means a 40-question exam for 1,200 students produces 48,000 rows with duplicated content for a single exam. `04 §12`'s example school runs 47 exams a term.

Content duplication is intentional and correct — `06 §74` and `07 §37` establish why — but snapshots plus answers become the largest tables in the system, and they grow monotonically because `07 §40` forbids deletion.

The shape also determines the cost of the start transaction, which runs at the moment 20 students in a lab press Start within seconds of each other. Per-question rows make that 40 inserts per student; a single document makes it one.

## Options considered

1. **Per-question rows** — natural for SQL analytics, expensive at start, high row count.
2. **One JSONB document per attempt** — matches the access pattern, cheap at start, compresses well.

## Decision

**One JSONB snapshot document per attempt.**

- The client fetches the whole attempt package at once (`08 §11.1`), so the document matches the access pattern exactly.
- Row count drops by the question count — roughly 40× fewer rows on the largest table.
- The start transaction becomes one insert rather than forty, materially reducing contention during a lab start burst.
- **Per-question analytics is unaffected**, because `AttemptQuestionResult` stays relational and is what analytics actually aggregates (`05 §52`).

**Randomisation** (resolving `A-08`): both question order and option order are **materialised into the document** at attempt start, exactly as `07 §9.2` describes. The seed is stored alongside for forensic reproducibility. Presentation order is **never** computed at read time — a student refreshing must receive byte-identical ordering, or they could infer information by re-rolling.

**The document is immutable once written**, enforced by constraint.

**The client-facing projection omits `correct_answer_snapshot`** — see `X-05`. Marking reads the stored document server-side only.

## Consequences

**Easier**

- Start transaction cost drops sharply, which matters most under concurrent starts (`X-03`).
- Storage growth is materially lower and compresses better.
- Serving the attempt package is a single row read.

**Harder**

- Ad-hoc SQL against individual snapshot questions must traverse JSONB; acceptable because `AttemptQuestionResult` carries the analytics load.
- Schema evolution inside the document needs a version field so old attempts remain readable.
- Partitioning or archival still needed as volume grows, per [ADR-0028](./ADR-0028-data-protection-and-retention.md).

**Required changes**

- B13: JSONB snapshot with a version field; materialised orders; stored seed; immutability constraint; client projection excluding the answer key.
- B13 testing: refresh returns byte-identical ordering; the client payload contains no correct answers.
- B21: measure real storage growth and confirm the strategy.
