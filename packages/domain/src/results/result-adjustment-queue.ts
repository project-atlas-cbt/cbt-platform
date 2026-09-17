/**
 * Cross-process BullMQ contract for B15's bulk-adjustment processing.
 *
 * `apps/api` (`ResultAdjustmentService`) is the producer; `apps/worker`
 * (`result-adjustment.queue.ts`) is the consumer. Neither app can import the
 * other's source — only `packages/*` is shared — so the queue name and
 * payload shape live here, mirroring `ATTEMPT_MARKING_QUEUE_NAME`'s own B14
 * precedent and `packages/notifications`' dispatch-queue contract before it.
 */
export const RESULT_ADJUSTMENT_QUEUE_NAME = 'atlas-result-adjustment';

export interface ResultAdjustmentJobPayload {
  schoolId: string;
  operationId: string;
}

/**
 * How long a claim on an adjustment operation stays valid without being
 * refreshed. A worker refreshes `processingClaimedAt` after each chunk, so a
 * lease older than this means the previous run died rather than that it is
 * still working — at which point a retry may safely take the operation over.
 * Mirrors B7's import-commit claim, whose lease semantics this reuses.
 */
export const RESULT_ADJUSTMENT_CLAIM_TTL_MS = 5 * 60 * 1000;

/** Results processed per transaction. Chunked so a large cohort neither
 * holds one transaction open for its whole run nor loses all progress to a
 * single failure. */
export const RESULT_ADJUSTMENT_CHUNK_SIZE = 100;
