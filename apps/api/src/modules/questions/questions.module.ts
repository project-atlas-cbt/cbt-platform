import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MediaModule } from '../media/media.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { QuestionController } from './question.controller.js';
import { QuestionService } from './question.service.js';
import { QuestionRevisionController } from './question-revision.controller.js';
import { QuestionRevisionService } from './question-revision.service.js';
import { QuestionMediaController } from './question-media.controller.js';
import { QuestionMediaService } from './question-media.service.js';
import { TopicController } from './topic.controller.js';
import { TopicService } from './topic.service.js';

/**
 * `08 §5`'s Question Bank domain (B8) — `Question`/`QuestionRevision`/
 * `QuestionOption`/`QuestionMedia`/`Topic`. `QuestionReview` (B9's approve/
 * reject/comment workflow) is deliberately not built here — see
 * `question.controller.ts`'s own doc comment.
 *
 * Imports `IdentityModule` for `@Authorized(...)`'s underlying `AuthGuard`
 * DI graph (every `@Authorized`-using module's established precedent),
 * `MediaModule` for `MediaService` (question image/diagram upload — see
 * `QuestionMediaService`'s own doc comment for why this module also adds
 * its own dedicated upload-target route rather than only reusing the
 * generic one), and `OperationsModule` for `AuditService`.
 *
 * Exports `QuestionService`/`TopicService` so `ImportsModule` (B7/B8) can
 * call `QuestionService.createFromImportRow()`/`TopicService.findOrCreate()`
 * directly rather than reimplementing question creation — one-directional
 * (this module has no dependency back on `ImportsModule`), the same shape
 * every other cross-module export in this codebase already uses.
 */
@Module({
  imports: [IdentityModule, MediaModule, OperationsModule],
  controllers: [
    QuestionController,
    QuestionRevisionController,
    QuestionMediaController,
    TopicController,
  ],
  providers: [QuestionService, QuestionRevisionService, QuestionMediaService, TopicService],
  exports: [QuestionService, TopicService],
})
export class QuestionsModule {}
