import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';
import { PLATFORM_MFA_AUDIT_ACTIONS } from './mfa/platform-mfa.service.js';
import { PLATFORM_PASSWORD_CHANGED_AUDIT_ACTION } from './platform-auth.service.js';

/** Registers every `AuditEvent.action` string this module's services emit
 * (B10). None of these are 07 §11.1 canonical actions/aliases — see
 * `packages/domain/src/audit/vocabulary.ts`. */
@Injectable()
export class PlatformAuditActionRegistrationProvider implements OnModuleInit {
  constructor(private readonly registry: AuditActionRegistry) {}

  onModuleInit(): void {
    this.registry.registerAll([
      'SCHOOL_BRANDING_CHANGED',
      'SCHOOL_ONBOARDING_COMPLETED',
      'SCHOOL_RESULT_POLICY_CHANGED',
      'PLATFORM_SCHOOL_CREATED',
      'PLATFORM_SCHOOL_REACTIVATED',
      'PLATFORM_SCHOOL_SUSPENDED',
      'PLATFORM_SCHOOL_DEACTIVATED',
      'PLATFORM_SUBSCRIPTION_ISSUED',
      // B20: platform-level (school_id NULL) sign-in and MFA events.
      ...Object.values(PLATFORM_MFA_AUDIT_ACTIONS),
      PLATFORM_PASSWORD_CHANGED_AUDIT_ACTION,
    ]);
  }
}
