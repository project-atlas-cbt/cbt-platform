# ADR-0007 — Answer persistence model

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** A-07 (HIGH), D-06 (HIGH), X-04 (HIGH)
**Blocks phases:** B13

## Context

`07 §9.3` leaves the requirement genuinely undecided: _"The latest saved answer is not overwritten in a way that destroys historical audit context **if audit-grade answer history is required**. At minimum, final submitted state must remain reconstructable."_

The document says "if required" without saying whether it is required — for the single most evidentiary table in the product.

Two very different schemas follow. One mutable row per question is small and fast with no history. An append-only event log is fully auditable but, at 1,000 concurrent students, differs in write volume by an order of magnitude — and `08 §20`'s write-pressure model depends on which is chosen.

Separately, `X-04`: nothing specifies ordering when a replayed offline answer for question 7 arrives **after** a newer online answer for the same question. Naive last-write-wins on receipt time silently reverts the student's newer answer.

## Decision

**One mutable row plus an append-only event log, written in the same transaction.**

- **`AttemptAnswer`** — one mutable row per (attempt, question). This is the hot read/write path and stays a single indexed upsert, per `09 §45`'s requirement that the interactive path stay tiny.
- **`AttemptAnswerEvent`** — append-only, written in the same transaction, retained through result finalisation plus a defined window.
- **Ordering protection**: each answer carries a client-assigned monotonic **sequence number** per (attempt, question). The server rejects any write whose sequence is lower than the stored one, making replay order-independent. The sequence is used **only** for ordering, never for admissibility — that remains server receipt time per [ADR-0003](./ADR-0003-post-expiry-cutoff-policy.md).
- Answers become immutable after submission, enforced by constraint (`07 §38`).

## Consequences

**Easier**

- "Final submitted state must remain reconstructable" is satisfied, with real dispute-resolution evidence beyond it.
- Out-of-order offline replay cannot silently revert a student's answer.
- The read path stays a single indexed row.

**Harder**

- Roughly double the write volume on the hottest path. Must be measured in B21 at all levels (20/100/500/1,000).
- The event log grows monotonically alongside snapshots and answers (`R-05`), feeding the retention question in [ADR-0028](./ADR-0028-data-protection-and-retention.md).
- If load testing shows the event log is too costly, it can be reduced to sampling or disabled per environment **without a schema change** — which is precisely why writing it from the start is cheaper than retrofitting.

**Required changes**

- B13: both tables; same-transaction write; sequence-number validation; post-submission immutability constraint.
- B13 testing: interleaved online/offline sequence proving replay cannot overwrite a newer answer.
- B21: measure write amplification; decide whether to sample.
- F13: maintain per-question sequence numbers in the offline queue.

## Amendment — 2026-10-03 (B21)

B21 measured the event log's cost, as this ADR required ([capacity plan](../performance/capacity-plan.md) §8):

- **Write volume:** one `AttemptAnswerEvent` per accepted change (≈ 1.7 per answered question at a
  10 s answer interval). At 1,000 attempts the event insert averaged 0.17 ms against 0.26 ms for the
  `AttemptAnswer` upsert, in the same transaction.
- **Storage:** ≈ 17.7 KB per 40-question attempt, about 31 % of the ≈ 57 KB an attempt costs in total.
- **Decision: keep full logging; do not sample.** Steady-state answer saves meet budget at 1,000
  attempts with the log on, and the database is not the binding resource (API CPU is), so sampling
  would save little latency while giving up dispute evidence. The table is academic evidence under
  the retention schedule ([ADR-0028](./ADR-0028-data-protection-and-retention.md) amendment), so its
  growth is planned for, not trimmed. Revisit only if a staging measurement (B23) shows the
  database, not the API, saturating.
