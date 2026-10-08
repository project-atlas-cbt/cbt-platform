import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';
import { IDENTITY_AUDIT_ACTIONS } from './identity.service.js';
import { STUDENT_PASSWORDLESS_AUDIT_ACTIONS } from './student-passwordless.service.js';

/** B20: registers the identity audit actions (sign-in, lockout, password
 * change/reset) — same per-module registration idiom as every other
 * module's provider (B10). None are 07 §11.1 canonical actions. */
@Injectable()
export class IdentityAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll(Object.values(IDENTITY_AUDIT_ACTIONS));
    this.registry.registerAll(Object.values(STUDENT_PASSWORDLESS_AUDIT_ACTIONS));
  }
}
