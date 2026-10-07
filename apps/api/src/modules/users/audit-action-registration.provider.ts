import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

/** Registers every `AuditEvent.action` string this module's services emit
 * (B10). `STUDENT_DEACTIVATED`/`TEACHER_DEACTIVATED`/`MODERATOR_REMOVED`
 * are 07 §11.1 canonical aliases of `USER_DEACTIVATED` — see
 * `packages/domain/src/audit/vocabulary.ts` for why they're aliased, not
 * renamed (each is a genuinely distinct role-lifecycle event this table's
 * own per-role naming already correctly distinguishes). */
@Injectable()
export class UsersAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll([
      'HOD_PROMOTED',
      'HOD_UPDATED',
      'HOD_CREDENTIALS_RESET',
      'HOD_REMOVED',
      'MODERATOR_CREATED',
      'MODERATOR_UPDATED',
      // 07 §11.1 canonical alias (USER_DEACTIVATED).
      'MODERATOR_REMOVED',
      'STUDENT_CREATED',
      'STUDENT_UPDATED',
      'STUDENT_CREDENTIALS_RESET',
      // 07 §11.1 canonical alias (USER_DEACTIVATED).
      'STUDENT_DEACTIVATED',
      'STUDENT_REACTIVATED',
      'STUDENT_SIGN_IN_UNLOCKED',
      'TEACHER_CREATED',
      'TEACHER_UPDATED',
      'TEACHER_CREDENTIALS_RESET',
      // 07 §11.1 canonical alias (USER_DEACTIVATED).
      'TEACHER_DEACTIVATED',
      'TEACHER_REACTIVATED',
    ]);
  }
}
