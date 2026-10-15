import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditActionRegistry } from '../operations/audit-action.registry.js';
import { PLATFORM_MFA_AUDIT_ACTIONS } from './mfa/platform-mfa.service.js';
import { PLATFORM_SETTING_CHANGED_ACTION } from './platform-settings-admin.service.js';
import { PLATFORM_PASSWORD_CHANGED_AUDIT_ACTION } from './platform-auth.service.js';
import { SCHOOL_ASSESSMENT_RULES_CHANGED_ACTION } from './school-assessment-rules.service.js';
import { MARKETING_LEAD_DELETED_ACTION } from './marketing/marketing.service.js';

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
      SCHOOL_ASSESSMENT_RULES_CHANGED_ACTION,
      'PLATFORM_SCHOOL_CREATED',
      'PLATFORM_SCHOOL_REACTIVATED',
      'PLATFORM_SCHOOL_SUSPENDED',
      'PLATFORM_SCHOOL_DEACTIVATED',
      'PLATFORM_SUBSCRIPTION_ISSUED',
      // B20: platform-level (school_id NULL) sign-in and MFA events.
      ...Object.values(PLATFORM_MFA_AUDIT_ACTIONS),
      // ADR-0036: System Configuration.
      PLATFORM_SETTING_CHANGED_ACTION,
      PLATFORM_PASSWORD_CHANGED_AUDIT_ACTION,
      // ADR-0034 amendment: a marketing site contact deleted.
      MARKETING_LEAD_DELETED_ACTION,
    ]);
  }
}
