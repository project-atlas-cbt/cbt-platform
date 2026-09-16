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
import { AttemptFinalizationService } from './attempt-finalization.service.js';
import { AttemptLifecycleService } from './attempt-lifecycle.service.js';
import { AttemptMarkingQueueService } from './attempt-marking-queue.service.js';
import { AttemptStatusService } from './attempt-status.service.js';
import { ParticipationController } from './participation.controller.js';
import { ParticipationNotificationService } from './participation-notification.service.js';
import { ParticipationService } from './participation.service.js';
import { StudentAssessmentController } from './student-assessment.controller.js';
import { StudentAssessmentService } from './student-assessment.service.js';
import { StudentParticipationService } from './student-participation.service.js';

/**
 * `exam-control.v1` (B12 — Exam Activation & Control; ADR-0006, ADR-0009,
 * ADR-0020; ADR-0012/M-15's `ExamAdministrator` clause).
 *
 * This is `08 §5`'s own bounded domain — "Execution — Exam sessions,
 * participants, attempts, snapshots, answers and participation". B16 extends
 * this same bounded domain with absence, makeup, retry and history surfaces.
 */
@Module({
  imports: [IdentityModule, OperationsModule, NotificationCenterModule],
  controllers: [
    ExamControlController,
    ExamSessionController,
    AttemptController,
    StudentAssessmentController,
    ParticipationController,
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
    AttemptLifecycleService,
    AttemptAnswerService,
    AttemptEventService,
    StudentAssessmentService,
    AttemptAuditActionRegistrationProvider,
    AttemptFinalizationService,
    AttemptMarkingQueueService,
    AttemptStatusService,
    ParticipationService,
    ParticipationNotificationService,
    StudentParticipationService,
  ],
})
export class ExecutionModule {}
