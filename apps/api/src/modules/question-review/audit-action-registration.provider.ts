import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

/** Registers every `AuditEvent.action` string this module's service emits
 * (B10). `QUESTION_APPROVED`/`QUESTION_REJECTED` are 07 §11.1 canonical
 * actions, verbatim — renamed from `QUESTION_REVIEW_APPROVED`/
 * `QUESTION_REVIEW_REJECTED` as part of this same phase (see
 * `question-review.service.ts`'s `approve()`/`reject()`).
 * `QUESTION_REVIEW_CHANGES_REQUESTED` stays unrenamed — no canonical
 * "request changes" action exists in 07 §11.1's list. */
@Injectable()
export class QuestionReviewAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll([
      'QUESTION_APPROVED',
      'QUESTION_REJECTED',
      'QUESTION_REVIEW_CHANGES_REQUESTED',
    ]);
  }
}
