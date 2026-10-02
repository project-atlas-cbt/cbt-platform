import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AuditVocabularyCoverageService } from './audit-vocabulary-coverage.service.js';
import { AuditCoreModule } from './audit-core.module.js';
import { OperationsAuditActionRegistrationProvider } from './audit-action-registration.provider.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditController } from './audit.controller.js';

/**
 * Bounded domain per 08 §5: "Operations — Audit, notifications, health and
 * background jobs." Health lives here conceptually but is wired directly
 * in B0 (see ../health) since every phase after B0 depends on it.
 *
 * B2 populated a minimal, real AuditService (write path only) ahead of the
 * full B10 deliverable it's now extended with in place — school-scoped
 * retrieval (`AuditQueryService`/`GET /v1/audit`, `@Authorized`, the normal
 * `AuthGuard`), the canonical action vocabulary
 * (`AuditActionRegistry`/`AuditVocabularyCoverageService`), and the
 * append-only trigger (the B10 migration's own SQL — nothing to wire here,
 * enforced at the database level). Extended in place rather than split
 * into a new peer module: this module already owns `AuditEvent`'s write
 * path and its own doc comment already earmarked retrieval as B10 scope —
 * unlike B9/B11's peer modules (genuinely new bounded concerns), splitting
 * one table's read/write across two modules here would serve no purpose.
 *
 * Imports `IdentityModule` for the same reason every `@Authorized`-using
 * module does — `AuthGuard`'s own constructor dependencies (`SessionService`)
 * are only exported from there, and Nest resolves a guard's DI graph from
 * the *consuming* module's injector, not wherever the guard happens to
 * live (found the hard way, via a real compiled-app boot failure, exactly
 * the class of gap B2/B9 both hit in their own phases).
 *
 * `GET /v1/platform/audit` (`PlatformAuditController`/
 * `PlatformAuditReaderService`, `@AuthorizedPlatform`) deliberately lives
 * in `PlatformModule` instead, not here — it needs `PlatformAuthGuard`'s
 * own DI graph, which is a `PlatformModule`-internal, unexported provider;
 * importing `PlatformModule` here would be circular, since `PlatformModule`
 * already imports `OperationsModule` for `AuditService`.
 *
 * The in-app `Notification` system (`GET /v1/notifications`, mark-read,
 * the retry-queue dispatch pipeline) is a separate, new peer module —
 * `notification-center` — not folded in here, since it owns a genuinely
 * different table/concern and needs its own BullMQ queue/worker wiring.
 */
@Module({
  imports: [IdentityModule, AuditCoreModule],
  controllers: [AuditController],
  providers: [
    AuditVocabularyCoverageService,
    AuditQueryService,
    OperationsAuditActionRegistrationProvider,
  ],
  // B20: AuditService/AuditActionRegistry now live in the global
  // AuditCoreModule (see its doc comment); re-exported here so every
  // existing `imports: [OperationsModule]` keeps resolving them unchanged.
  exports: [AuditCoreModule],
})
export class OperationsModule {}
