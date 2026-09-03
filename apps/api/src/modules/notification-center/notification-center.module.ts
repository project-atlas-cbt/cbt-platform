import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';
import { NotificationDispatchQueueService } from './notification-dispatch-queue.service.js';

/**
 * B10's in-app `Notification` system — `GET /v1/notifications`, mark-read,
 * and the out-of-band retry-dispatch queue (`NotificationDispatchQueueService`;
 * the consumer half lives in `notification-dispatch-worker-bootstrap.ts`,
 * started only from `main.ts`, never via Nest's module lifecycle — see that
 * file's own doc comment).
 *
 * Deliberately a separate peer module from the existing, `@Global()`
 * `apps/api/src/notifications/` (the thin ADR-0019 channel/template-
 * registry DI shim, unchanged by this phase and still injected directly by
 * any module sending an out-of-band message) — this module owns a
 * genuinely different table/concern (the persisted `Notification` row and
 * its read state) and needs its own BullMQ queue wiring, matching B9/B11's
 * own "genuinely new bounded concern gets a peer module" precedent.
 *
 * Imports `IdentityModule` (the standard `@Authorized(...)` pair) and
 * `OperationsModule` — not for `AuditService` (this module writes no audit
 * events of its own), but because every producer that calls into
 * `NotificationService` from elsewhere in the codebase already imports
 * `OperationsModule` too; `NotificationService` itself is exported here so
 * those producers (question-review, the worker) can call it directly.
 */
@Module({
  imports: [IdentityModule, OperationsModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationDispatchQueueService],
  exports: [NotificationService, NotificationDispatchQueueService],
})
export class NotificationCenterModule {}
