import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

@Injectable()
export class ImportsAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll([
      'STUDENT_IMPORT_COMPLETED',
      'TEACHER_IMPORT_COMPLETED',
      'QUESTION_IMPORT_COMPLETED',
    ]);
  }
}
