import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

/** Registers every `AuditEvent.action` string this module's services emit
 * (B10) — `EXAM_READY` is a 07 §11.1 canonical action verbatim; see
 * `packages/domain/src/audit/vocabulary.ts`. */
@Injectable()
export class ExamsAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll([
      'EXAM_CREATED',
      'EXAM_UPDATED',
      'EXAM_DELETED',
      // 07 §11.1 canonical, verbatim.
      'EXAM_READY',
      'EXAM_CANCELLED',
      'EXAM_ARCHIVED',
      'EXAM_CONFIGURATION_UPDATED',
      'EXAM_QUESTIONS_UPDATED',
    ]);
  }
}
