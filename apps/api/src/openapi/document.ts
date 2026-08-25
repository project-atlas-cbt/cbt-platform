import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Shared between the live app (Swagger UI, if mounted later) and the
 * standalone emit script (emit.ts) that produces apps/api/openapi.json for
 * @atlas/contracts to generate types from.
 *
 * `productName` is threaded in by the caller (never hardcoded here — see
 * @atlas/config's getProductName(), PROJECT.md).
 */
export function buildOpenApiConfig(productName: string) {
  return new DocumentBuilder()
    .setTitle(`${productName} API`)
    .setDescription(
      'Multi-tenant CBT platform API. Error envelope and idempotency contract: ADR-0033.',
    )
    .setVersion('1.0.0')
    .addServer('/v1')
    .build();
}
