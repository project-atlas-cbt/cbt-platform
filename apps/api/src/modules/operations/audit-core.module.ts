import { Global, Module } from '@nestjs/common';
import { AuditActionRegistry } from './audit-action.registry.js';
import { AuditService } from './audit-event.service.js';

/**
 * B20: the audit write path (`AuditService`) and its action registry, split
 * out of `OperationsModule` and made `@Global()` so `IdentityModule` can
 * audit sign-ins and credential changes. `OperationsModule` imports
 * `IdentityModule` (for `AuthGuard`'s DI graph), so `IdentityModule`
 * importing `OperationsModule` back would be circular. These two providers
 * depend on nothing module-scoped, so they lose nothing by being global —
 * and there is still exactly one `AuditService` instance, one write path.
 */
@Global()
@Module({
  providers: [AuditService, AuditActionRegistry],
  exports: [AuditService, AuditActionRegistry],
})
export class AuditCoreModule {}
