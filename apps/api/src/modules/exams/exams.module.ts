import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { QuestionsModule } from '../questions/questions.module.js';
import { ExamConfigurationService } from './exam-configuration.service.js';
import { ExamQuestionService } from './exam-question.service.js';
import { ExamReadinessService } from './exam-readiness.service.js';
import { ExamController } from './exam.controller.js';
import { ExamService } from './exam.service.js';

/**
 * `exams.v1` (B11 — Exam Builder & Readiness; ADR-0001, ADR-0002,
 * ADR-0006, ADR-0013, ADR-0029). Bounded domain per `08 §5`: "Exams —
 * exams, sections, exam-question bindings, readiness and configuration."
 *
 * A peer top-level module, mirroring `QuestionReviewModule`'s (B9) own
 * precedent exactly: imports `IdentityModule` (for `@Authorized(...)`'s
 * underlying `AuthGuard` DI graph) and `OperationsModule` (for
 * `AuditService`); `NotificationsModule` is `@Global()` (B0/ADR-0019) so no
 * explicit import is needed — B11 sends no notification of its own (the
 * roadmap's Security section only names `EXAM_READY`/`EXAM_CANCELLED` as
 * *audited*, not notified, unlike B9's explicit notification requirement).
 *
 * One-directional import of `QuestionsModule` — reaches its exported
 * `QuestionService` for the "browse approved questions available to bind"
 * route (`GET /v1/exams/:id/available-questions`), reusing its existing
 * scope-filter/pagination logic verbatim rather than reimplementing it.
 * `QuestionsModule` gains no dependency back on `ExamsModule`.
 *
 * `B12` (activation & control — ADR-0006's operational half, ADR-0009,
 * ADR-0020) is explicitly not built here: no `ExamSessionParticipant`, no
 * attempt/session machinery, no Control Center. `exam.pause`/
 * `.closeNewAttempts`/`.reopen` and every `examAdmin.*` permission-table
 * row stay `awaitingResource`-flagged, untouched by this module.
 */
@Module({
  imports: [IdentityModule, OperationsModule, QuestionsModule],
  controllers: [ExamController],
  providers: [ExamService, ExamQuestionService, ExamConfigurationService, ExamReadinessService],
})
export class ExamsModule {}
