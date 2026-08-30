import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import type { TemplateRegistry } from '@atlas/notifications';
import { NOTIFICATION_TEMPLATE_REGISTRY } from '../../notifications/notifications.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { QuestionReviewController } from './question-review.controller.js';
import { QuestionReviewService } from './question-review.service.js';
import { registerQuestionReviewTemplates } from './templates.js';

/**
 * `question-review.v1` (B9) — the HOD approve/reject/request-changes
 * workflow B8 deliberately left unbuilt (see `questions/question.controller
 * .ts`'s own doc comment; `packages/domain`'s permission table's
 * `questionBank.review`/`.approve`/`.reject`/`.requestChanges`/
 * `.comment.*` rows).
 *
 * A peer top-level module, not nested inside `QuestionsModule` — mirrors
 * `ImportsModule`'s own precedent (B7) exactly: a bounded-context module
 * that writes through another domain's primitives via plain function
 * imports (`questions/question-mappers.ts`'s `QUESTION_REVISION_INCLUDE`/
 * `toRevisionResponseDto`), not DI, so no dependency on `QuestionsModule`
 * itself is needed.
 *
 * Imports `IdentityModule` for `@Authorized(...)`'s underlying `AuthGuard`
 * DI graph (every `@Authorized`-using module's established precedent) and
 * `OperationsModule` for `AuditService`. `NotificationsModule` is
 * `@Global()` (B0/ADR-0019) — no explicit import needed for
 * `NOTIFICATION_CHANNEL`/`NOTIFICATION_TEMPLATE_REGISTRY`.
 */
@Module({
  imports: [IdentityModule, OperationsModule],
  controllers: [QuestionReviewController],
  providers: [QuestionReviewService],
})
export class QuestionReviewModule implements OnModuleInit {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REGISTRY) private readonly templates: TemplateRegistry,
  ) {}

  onModuleInit(): void {
    registerQuestionReviewTemplates(this.templates);
  }
}
