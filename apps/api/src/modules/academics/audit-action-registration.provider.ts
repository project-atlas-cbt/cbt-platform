import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

/** Registers every `AuditEvent.action` string this module's services emit
 * — the source of truth for `AuditVocabularyCoverageService`'s canonical-
 * coverage check (B10), kept with the module that owns each action rather
 * than a central hand-maintained list. Two of these
 * (`CLASS_CHANGED`/`TEACHER_ASSIGNMENTS_REPLACED`) are 07 §11.1 canonical
 * actions or aliases of one — see
 * `packages/domain/src/audit/vocabulary.ts`. */
@Injectable()
export class AcademicsAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll([
      'CLASS_CREDENTIAL_SHEET_ISSUED',
      'CLASS_GROUP_CREATED',
      'CLASS_GROUP_UPDATED',
      'CLASS_GROUP_ARCHIVED',
      'CLASS_GROUP_DELETED',
      'CLASS_SUBJECT_CREATED',
      'CLASS_SUBJECT_DELETED',
      'CLASS_SUBJECT_KIND_CHANGED',
      'SUBJECT_CHOICE_GROUP_CREATED',
      'SUBJECT_CHOICE_GROUP_UPDATED',
      'SUBJECT_CHOICE_GROUP_DELETED',
      'DEPARTMENT_CREATED',
      'DEPARTMENT_UPDATED',
      'DEPARTMENT_DEACTIVATED',
      'DEPARTMENT_DELETED',
      'HOD_ASSIGNMENT_CREATED',
      'HOD_ASSIGNMENT_REASSIGNED',
      'HOD_ASSIGNMENT_ENDED',
      'ACADEMIC_SESSION_CREATED',
      'ACADEMIC_SESSION_UPDATED',
      'ACADEMIC_SESSION_ACTIVATED',
      'ACADEMIC_SESSION_CLOSED',
      'ACADEMIC_SESSION_ARCHIVED',
      'ACADEMIC_SESSION_DELETED',
      'SUBJECT_CREATED',
      'SUBJECT_UPDATED',
      'SUBJECT_DEACTIVATED',
      'SUBJECT_DELETED',
      // 07 §11.1 canonical alias — see teacher-assignment.service.ts.
      'TEACHER_ASSIGNMENTS_REPLACED',
      'ACADEMIC_TERM_CREATED',
      'ACADEMIC_TERM_UPDATED',
      'ACADEMIC_TERM_ACTIVATED',
      'ACADEMIC_TERM_DELETED',
      'STUDENT_ENROLLED',
      // 07 §11.1 canonical — see student-enrollment.service.ts's enroll().
      'CLASS_CHANGED',
      'STUDENT_SUBJECT_DEREGISTERED',
      'STUDENT_SUBJECT_RE_REGISTERED',
      'STUDENT_SUBJECT_REGISTERED',
      'FORM_TEACHER_ASSIGNED',
      'FORM_TEACHER_ENDED',
      'ACADEMIC_ROLLOVER_PLAN_GENERATED',
      'ACADEMIC_ROLLOVER_DECISION_OVERRIDDEN',
      'ACADEMIC_ROLLOVER_DECISION_COMMITTED',
      'ACADEMIC_ROLLOVER_STRUCTURE_UPDATED',
      'ACADEMIC_ROLLOVER_COMMITTED',
    ]);
  }
}
