import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger/OpenAPI mirror of @atlas/validation's `ErrorEnvelope` interface
 * (the actual runtime type — this DTO exists purely so the shape appears
 * in components.schemas of the generated OpenAPI document; nothing
 * constructs an instance of it). ADR-0033: every non-2xx response from
 * this API takes this shape.
 *
 * Every @ApiProperty() below specifies `type` explicitly — reflected
 * `design:type` metadata for a bare `field!: string` (no initializer) is
 * unreliable here and @nestjs/swagger misreads it as a self-reference,
 * failing the whole document generation with a false "circular
 * dependency" error.
 */
export class ErrorEnvelopeErrorDto {
  @ApiProperty({
    type: String,
    description: 'Stable, machine-readable code. Clients branch on this, never on `message`.',
    example: 'VALIDATION_ERROR',
  })
  code!: string;

  @ApiProperty({
    type: String,
    description: 'Human-readable — for logs/debugging, not client branching.',
  })
  message!: string;

  @ApiProperty({
    type: Boolean,
    description:
      "Whether retrying the same request (with the same Idempotency-Key, if it had one) could succeed. F13's offline sync queue decides retry-vs-drop from this.",
  })
  retryable!: boolean;

  @ApiProperty({ type: String, description: 'Correlates this response to server-side logs.' })
  correlationId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    // Not `required: false` — for a `type: 'object'` schema, `required`
    // means the *nested* required property names (string[]); whether this
    // property itself is optional is `selfRequired`.
    selfRequired: false,
    description: "Present for some error codes — e.g. VALIDATION_ERROR's failing fields.",
  })
  details?: Record<string, unknown>;
}

export class ErrorEnvelopeDto {
  @ApiProperty({ type: ErrorEnvelopeErrorDto })
  error!: ErrorEnvelopeErrorDto;
}
