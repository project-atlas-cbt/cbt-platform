import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * `@nestjs/swagger` has no declarative way to add a header to
 * `components.parameters` that isn't attached to a specific operation via
 * `@ApiHeader` — and B0 has no mutating endpoints yet to attach one to
 * (only the two GET /health routes). Injecting it directly into the
 * generated document is the pragmatic way to publish the ADR-0033
 * Idempotency-Key contract now, as a reusable component every later
 * phase's mutating endpoints reference via `$ref`, rather than waiting
 * for the first real POST/PUT/PATCH/DELETE endpoint to exist.
 */
export function injectSharedComponents(document: OpenAPIObject): void {
  document.components ??= {};
  document.components.parameters ??= {};
  document.components.parameters.IdempotencyKey = {
    name: 'Idempotency-Key',
    in: 'header',
    required: false,
    description:
      'ADR-0033: a client-generated UUIDv7, one per logical mutating operation (POST/PUT/PATCH/DELETE). ' +
      'A replay of the same key returns the original response unchanged; the same key with a ' +
      'different request body is rejected with IDEMPOTENCY_KEY_REPLAY_MISMATCH (409), never a silent ' +
      'overwrite. Optional per endpoint — GET/HEAD ignore it entirely.',
    schema: { type: 'string', format: 'uuid' },
  };
}
