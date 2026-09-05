import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationCenterModule } from '../notification-center/notification-center.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { ExamAdministratorScopeResolverProvider } from './exam-administrator-scope-resolver.provider.js';
import { ExamAdministratorService } from './exam-administrator.service.js';
import { ExamCompletionService } from './exam-completion.service.js';
import { ExamControlAuditActionRegistrationProvider } from './exam-control-audit-action-registration.provider.js';
import { ExamControlCenterService } from './exam-control-center.service.js';
import { ExamControlController } from './exam-control.controller.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';
import { ExamLifecycleService } from './exam-lifecycle.service.js';
import { ExamSessionParticipantService } from './exam-session-participant.service.js';
import { ExamSessionController } from './exam-session.controller.js';
import { ExamSessionService } from './exam-session.service.js';
import { AttemptAnswerService } from './attempt-answer.service.js';
import { AttemptAuditActionRegistrationProvider } from './attempt-audit-action-registration.provider.js';
import { AttemptController } from './attempt.controller.js';
import { AttemptEventService } from './attempt-event.service.js';
import { AttemptLifecycleService } from './attempt-lifecycle.service.js';
import { StudentAssessmentController } from './student-assessment.controller.js';
import { StudentAssessmentService } from './student-assessment.service.js';

/**
 * `exam-control.v1` (B12 — Exam Activation & Control; ADR-0006, ADR-0009,
 * ADR-0020; ADR-0012/M-15's `ExamAdministrator` clause).
 *
 * This is `08 §5`'s own bounded domain — "Execution — Exam sessions,
 * participants, attempts, snapshots, answers and participation" — B0's
 * original stub comment here named only B13/B14/B16 as populators, an
 * omission found and corrected while planning B12: `ExamSession`/
 * `ExamSessionParticipant` are literally "exam sessions, participants,"
 * squarely inside this module's own documented scope, not a new bounded
 * domain of their own. Populated here for the first time; B13 (attempts,
 * snapshots, answers), B14 (submission & marking), and B16 (participation/
 * absence/makeup) extend it further, reusing this module's existing
 * imports/providers rather than introducing a second "execution-shaped"
 * module.
 *
 * Mirrors `QuestionReviewModule`'s (B9) own peer-module precedent for its
 * imports: `IdentityModule` (`@Authorized(...)`'s `AuthGuard` DI graph),
 * `OperationsModule` (`AuditService`), and `NotificationCenterModule`
 * (`NotificationService` — B10's in-app `Notification` persistence, a
 * regular peer module, not `@Global()`, unlike the older ADR-0019 channel
 * shim).
 *
 * Deliberately does NOT split the SSE piece into a separate `RealtimeModule`
 * as the roadmap's own "Domains/modules affected" line for B12 suggests —
 * the Control Center aggregate computation (`exam-control-snapshot.util
 * .ts`) and the SSE stream service must share one aggregate-shape contract
 * and are too tightly coupled to gain anything from a cross-module split.
 *
 * No import of `ExamsModule` (B11) is needed: every helper this module
 * reuses from it (`loadExamOrThrow`, `toExamResponseDtoFresh`) is a plain
 * exported function, not a Nest provider — the same "importable without a
 * DI edge" precedent `exam-scope.util.ts`'s own `requireSchoolActor`
 * re-export already established.
 */
@Module({
  imports: [IdentityModule, OperationsModule, NotificationCenterModule],
  controllers: [
    ExamControlController,
    ExamSessionController,
    AttemptController,
    StudentAssessmentController,
  ],
  providers: [
    ExamLifecycleService,
    ExamSessionService,
    ExamSessionParticipantService,
    ExamAdministratorService,
    ExamControlCenterService,
    ExamControlStreamService,
    ExamCompletionService,
    ExamControlAuditActionRegistrationProvider,
    ExamAdministratorScopeResolverProvider,
    // B13 — Attempt Engine. ObjectStorageService (AttemptLifecycleService's
    // media-manifest dependency) is provided by the @Global() StorageModule
    // — no import needed here, same as MediaService's own precedent.
    AttemptLifecycleService,
    AttemptAnswerService,
    AttemptEventService,
    StudentAssessmentService,
    AttemptAuditActionRegistrationProvider,
  ],
})
export class ExecutionModule {}
