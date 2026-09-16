import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

/** Registers every exam-control, participation and authorization audit action. */
@Injectable()
export class ExamControlAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}
  onModuleInit(): void {
    this.registry.registerAll([
      'EXAM_OPENED',
      'EXAM_CLOSED',
      'EXAM_REOPENED',
      'EXAM_COMPLETED',
      'EXAM_PARTICIPATION_MARKED_ABSENT',
      'EXAM_SESSION_OPENED',
      'EXAM_SESSION_CLOSED',
      'EXAM_SESSION_REOPENED',
      'EXAM_SESSION_PARTICIPANT_AUTHORIZED',
      'EXAM_SESSION_PARTICIPANT_REVOKED',
      'EXAM_ADMINISTRATOR_ASSIGNED',
      'EXAM_ADMINISTRATOR_REVOKED',
      'MAKEUP_GRANTED',
      'ATTEMPT_RETRY_AUTHORIZED',
      'ATTEMPT_INVALIDATED',
    ]);
  }
}
