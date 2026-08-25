import { Module } from '@nestjs/common';

/**
 * Bounded domain per 08 §5: "Analytics — Derived metrics and report views;
 * should not own authoritative academic facts." Populated by B17
 * (analytics) and B18 (reporting & export — ADR-0030).
 *
 * Deliberately empty in B0 — module boundary stubbed, no domain logic.
 */
@Module({})
export class AnalyticsModule {}
