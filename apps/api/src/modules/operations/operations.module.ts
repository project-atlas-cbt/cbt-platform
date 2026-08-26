import { Module } from '@nestjs/common';
import { AuditService } from './audit-event.service.js';

/**
 * Bounded domain per 08 §5: "Operations — Audit, notifications, health and
 * background jobs." Health lives here conceptually but is wired directly
 * in B0 (see ../health) since every phase after B0 depends on it.
 *
 * B2 populates a minimal, real AuditService (write path only) ahead of the
 * full B10 deliverable — see AuditService's own doc comment for why this
 * mirrors B0's NotificationChannel precedent rather than waiting for B10.
 * Notification dispatch and audit retrieval/retention remain B10 scope.
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class OperationsModule {}
