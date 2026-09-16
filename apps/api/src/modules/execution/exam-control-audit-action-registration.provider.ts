import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

/** Registers every `AuditEvent.action` string this module's services emit
 * (B10/B12) — `EXAM_OPENED`/`EXAM_CLOSED` are 07 §11.1 canonical actions
 * verbatim (see `packages/domain/src/audit/vocabulary.ts`, flipped to
 * `LIVE` by this phase); every other string here is real but non-canonical,
 * following this codebase's own established precedent for adding action
 * strings 07 §11.1's own "Examples" list never named. */
@Injectable()
export class ExamControlAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll([
      // 07 §11.1 canonical, verbatim.
      'EXAM_OPENED',
      'EXAM_CLOSED',
      // Exam-level, distinct from the session-level actions below.
      'EXAM_REOPENED',
      'EXAM_COMPLETED',
      'EXAM_PARTICIPATION_MARKED_ABSENT',
      // Session-level.
      'EXAM_SESSION_OPENED',
      'EXAM_SESSION_CLOSED',
      'EXAM_SESSION_REOPENED',
      'EXAM_SESSION_PARTICIPANT_AUTHORIZED',
      'EXAM_SESSION_PARTICIPANT_REVOKED',
      // ADR-0012/M-15 delegation.
      'EXAM_ADMINISTRATOR_ASSIGNED',
      'EXAM_ADMINISTRATOR_REVOKED',
    ]);
  }
}
