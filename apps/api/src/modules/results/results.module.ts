import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationCenterModule } from '../notification-center/notification-center.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { GradingScaleController } from './grading-scale.controller.js';
import { GradingScaleService } from './grading-scale.service.js';
import { ResultAdjustmentQueueService } from './result-adjustment-queue.service.js';
import { ResultAdjustmentService } from './result-adjustment.service.js';
import { ResultAuditActionRegistrationProvider } from './result-audit-action-registration.provider.js';
import { ResultController } from './result.controller.js';
import { ResultPublicationService } from './result-publication.service.js';
import { ResultQueryService } from './result-query.service.js';
import { StudentResultController } from './student-result.controller.js';
import { StudentResultService } from './student-result.service.js';

/**
 * Bounded domain per 08 §5: "Results — Question-level marking, result
 * calculation, publication and adjustments." Stubbed empty in B0; populated
 * here by B15 (ADR-0010 publication model, ADR-0018 grading scale, ADR-0025
 * invalidation effect and bulk adjustment).
 *
 * Contracts: `results.v1` (staff) and `student-results.v1` (student).
 *
 * Imports mirror `ExecutionModule`'s own established set — `IdentityModule`
 * for `@Authorized(...)`'s `AuthGuard` DI graph, `OperationsModule` for
 * `AuditService`, `NotificationCenterModule` for the `RESULT_PUBLISHED`
 * producer B10 left to this phase.
 *
 * Deliberately does NOT import `ExamsModule`: everything this module reuses
 * from B11 (`loadExamOrThrow`) is a plain exported function rather than a
 * Nest provider — the same "importable without a DI edge" precedent
 * `exam-scope.util.ts` established and `ExecutionModule` already relies on.
 * `ExecutionModule` in turn imports this module's `ensureProcessingResult`
 * the same way, so no DI cycle exists in either direction.
 */
@Module({
  imports: [IdentityModule, OperationsModule, NotificationCenterModule],
  controllers: [ResultController, StudentResultController, GradingScaleController],
  providers: [
    ResultQueryService,
    ResultPublicationService,
    ResultAdjustmentService,
    ResultAdjustmentQueueService,
    StudentResultService,
    GradingScaleService,
    ResultAuditActionRegistrationProvider,
  ],
  exports: [GradingScaleService],
})
export class ResultsModule {}
