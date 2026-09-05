import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

/** Registers every `AttemptEvent.action` string B13/B14's services emit —
 * none collide with `packages/domain/src/audit/vocabulary.ts`'s canonical
 * list (`ATTEMPT_INVALIDATED` is the only `ATTEMPT_*` canonical entry, and
 * it's B16's action per ADR-0014, not one of these), following B12's own
 * established precedent for adding real, non-canonical action strings.
 * `ATTEMPT_AUTO_SUBMITTED` (B14, ADR-0004) is written from two independent
 * places — `AttemptFinalizationService` here and `apps/worker`'s sweeper —
 * both must produce this exact string. */
@Injectable()
export class AttemptAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll([
      'ATTEMPT_STARTED',
      'ATTEMPT_SUBMITTED',
      'ATTEMPT_AUTO_SUBMITTED',
      'ATTEMPT_ENDED_BY_STAFF',
      'ATTEMPT_EXTRA_TIME_GRANTED',
    ]);
  }
}
