import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';

/** Registers B18's application-specific audit actions (B10 registry policy). */
@Injectable()
export class ReportsAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll(['EXPORT_REQUESTED']);
  }
}
