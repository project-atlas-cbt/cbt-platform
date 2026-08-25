/**
 * `@atlas/contracts` is what apps/web (and any other API consumer) imports
 * instead of hand-writing request/response types. It has two layers:
 *
 *  1. `generated/openapi-types.ts` — mechanically generated from
 *     apps/api's published OpenAPI document by `pnpm generate` (never
 *     hand-edited; CI fails the build if it drifts from the document).
 *  2. This file — small hand-written conveniences (path helpers, re-exports)
 *     that sit on top of the generated types.
 *
 * B0 ships the pipeline and the health-check contract; each later backend
 * phase adds its endpoints to the OpenAPI document and this package's
 * generated types grow accordingly — nothing here is hand-maintained.
 */
export type { paths as ApiPaths, components as ApiComponents } from './generated/openapi-types.js';
export { BASE_ERROR_CODES, type BaseErrorCode } from '@atlas/domain';

/** `/v1` is fixed by convention (09 §20) — not configurable per environment. */
export const API_VERSION_PREFIX = '/v1' as const;
