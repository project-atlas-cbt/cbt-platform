# ADR-0033 — Idempotency key format and API error contract

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** M-16 (HIGH)
**Blocks phases:** B0, B13, F13

## Context

`08 §3` requires that submission, answer sync, imports, result generation and administrative commands tolerate retries. `08 §11.2` requires the offline client to synchronise pending changes _"using idempotent operation identifiers"_.

Nothing specified the identifier's format, where it travels, how long the server remembers it, what a replay returns, or what happens when the same key arrives with a different payload.

Likewise no error contract exists — yet `08 §12.3` requires reconciliation to be _"deterministic"_ and states that _"a client must never assume that a queued operation succeeded merely because it was sent."_ That is only implementable if the client can distinguish a retryable failure from a permanent rejection.

The offline exam client's correctness rests entirely on both contracts.

## Decision

### Idempotency

- Client-generated **UUIDv7**, one per logical operation, sent in an `Idempotency-Key` header.
- Applies to: start attempt, save answer, batch answer flush, submit, import confirm, and all administrative commands.
- The server stores the key with its response for a bounded window (24 hours; longer than any attempt).
- A replay with the same key returns the **original response**, not a re-execution.
- The same key with a **different payload** is a hard error (`409`), never a silent overwrite.

### Error envelope

Every non-2xx response returns:

```json
{
  "error": {
    "code": "ATTEMPT_EXPIRED",
    "message": "Human-readable, safe to display.",
    "retryable": false,
    "correlationId": "01J...",
    "details": {}
  }
}
```

- `code` is a stable, machine-readable enum — the client branches on it, never on message text.
- `retryable` tells the offline queue whether to retry or drop and surface.
- `correlationId` matches the server log and trace.
- `details` carries field-level validation errors where applicable.
- Cross-tenant resources return **404**, never 403, so existence is not disclosed.

The full code enum is published in the OpenAPI document and generated into `packages/contracts`.

## Consequences

**Easier**

- The offline queue can reconcile deterministically: retry on `retryable: true`, drop and inform the student on `false`.
- Duplicate submissions and double-clicked starts are handled uniformly rather than per-endpoint.
- `X-13` (invalidation mid-attempt) becomes implementable — a distinct non-retryable code stops the client cleanly.

**Harder**

- Every endpoint must classify its failures as retryable or not; a wrong classification either loses answers or retries forever.
- Idempotency storage needs its own expiry job.

**Required changes**

- B0: idempotency middleware, error envelope, code enum, contract generation.
- B13/B14: idempotent start, answer save, and submit.
- F0: typed error parsing branching on `retryable`.
- F13: sync queue honouring the contract.
