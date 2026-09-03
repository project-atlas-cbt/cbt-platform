import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

/** Registers every `AuditEvent.action` string this module's services emit
 * (B10). None of these are 07 §11.1 canonical actions/aliases — see
 * `packages/domain/src/audit/vocabulary.ts`. */
@Injectable()
export class QuestionsAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll([
      'QUESTION_REVISION_UPDATED',
      'QUESTION_REVISION_CREATED',
      'QUESTION_REVISION_SUBMITTED',
      'QUESTION_CREATED',
      'QUESTION_ARCHIVED',
    ]);
  }
}
