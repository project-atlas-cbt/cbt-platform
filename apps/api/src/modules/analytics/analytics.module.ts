import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsCacheService } from './analytics-cache.service.js';
import { AnalyticsService } from './analytics.service.js';

/**
 * Bounded domain per 08 §5: "Analytics — Derived metrics and report views;
 * should not own authoritative academic facts." Populated by B17
 * (analytics) and B18 (reporting & export — ADR-0030).
 *
 * Deliberately empty in B0 — module boundary stubbed, no domain logic.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsCacheService],
  exports: [AnalyticsService, AnalyticsCacheService],
})
export class AnalyticsModule {}
