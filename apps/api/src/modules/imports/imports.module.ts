import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MediaModule } from '../media/media.module.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { QuestionsModule } from '../questions/questions.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';
import { ImportQueueService } from './import-queue.service.js';
import { ImportValidationService } from './import-validation.service.js';
import { ImportCommitService } from './import-commit.service.js';

/**
 * Bounded infrastructure per `08 §5`'s "ImportModule, writing through
 * UsersModule and AcademicsModule services — never directly to their
 * tables" (roadmap's own Domains/modules affected line). Not nested under
 * UsersModule: it writes through both UsersModule's own creation
 * primitives (`person.util.ts`'s plain functions, imported directly — no
 * module dependency needed for those) and AcademicsModule's
 * `StudentEnrollmentService`, so a peer top-level module is the correct
 * shape, the same reasoning `MediaModule`'s own doc comment gives for not
 * living inside any single domain it serves.
 *
 * Imports `MediaModule` for `MediaService` (the IMPORT_SOURCE upload/
 * validate pipeline — see `MediaAssetType`'s own schema doc comment for
 * why import files get their own dedicated route pair rather than the
 * generic `MediaController`), `AcademicsModule` for
 * `AcademicsContextService` (current-session resolution, already exported)
 * and `StudentEnrollmentService` (newly exported below), `QuestionsModule`
 * (B8) for `QuestionService.createFromImportRow()`/`TopicService` (both
 * exported there — see that module's own doc comment), `OperationsModule`
 * for `AuditService`, and `IdentityModule` both for `@Authorized(...)`'s
 * underlying `AuthGuard` (this module's own routes are school-scoped, per
 * every other `@Authorized`-using module's established precedent) and for
 * `IdentityService.issueStaffInvitation()`.
 */
@Module({
  imports: [IdentityModule, MediaModule, AcademicsModule, QuestionsModule, OperationsModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportQueueService, ImportValidationService, ImportCommitService],
  // ImportValidationService/ImportCommitService are exported so
  // `import-worker-bootstrap.ts` can pull the real, DI-resolved instances
  // out of the booted app via `app.get(...)` from `main.ts` — see that
  // file's own doc comment for why the BullMQ `Worker` consumers are
  // constructed there, imperatively, rather than via this module's own
  // lifecycle.
  exports: [ImportValidationService, ImportCommitService],
})
export class ImportsModule {}
