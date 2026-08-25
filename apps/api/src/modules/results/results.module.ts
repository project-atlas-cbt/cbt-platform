import { Module } from '@nestjs/common';

/**
 * Bounded domain per 08 §5: "Results — Question-level marking, result
 * calculation, publication and adjustments." Populated by B15
 * (ADR-0010, ADR-0018, ADR-0025).
 *
 * Deliberately empty in B0 — module boundary stubbed, no domain logic.
 */
@Module({})
export class ResultsModule {}
