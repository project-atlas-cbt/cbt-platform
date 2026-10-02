import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from './audit-action.registry.js';
import { DATA_SUBJECT_REDACTED_ACTION } from './subject-redaction.js';

/** B20: operator-command actions written into school audit trails (the
 * `ops:redact-subject` CLI) — registered so the running app recognises
 * them when it reads/vocabulary-checks audit rows. */
@Injectable()
export class OperationsAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.register(DATA_SUBJECT_REDACTED_ACTION);
  }
}
