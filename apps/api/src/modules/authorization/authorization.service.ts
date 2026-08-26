import { Injectable, Logger } from '@nestjs/common';
import {
  requirePermissionRule,
  PERMISSION_TABLE,
  type PermissionAction,
  type PermissionSection,
  type ScopePredicate,
} from '@atlas/domain';
import { ScopeResolverRegistry } from './scope-resolvers.js';
import type {
  AuthorizationDecision,
  AuthorizedActor,
  ResourceContext,
} from './authorization.types.js';

export interface EffectivePermission {
  resource: string;
  section: PermissionSection;
  label: string;
  action: PermissionAction;
  scope?: ScopePredicate;
  breakGlass?: boolean;
}

/**
 * The effective-access function (08 §10): authenticated user + active
 * membership + role assignment + resource school + academic scope +
 * ownership/assignment + requested action. Resource *state* (the eighth
 * factor) is deliberately not modelled here yet — no phase before B8/B11
 * has a resource with a real state machine to gate on; PermissionRule
 * already carries state-aware notes (see Question Lifecycle rows) for
 * whichever phase wires that check into ResourceContext.
 *
 * Pure enough to unit-test with fixture actors (2026-08-26 decision: no
 * real Software Admin login exists yet, so break-glass and this function
 * are proven against constructed AuthorizedActor values, not real HTTP).
 */
@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger('Authorization');

  constructor(private readonly resolvers: ScopeResolverRegistry) {}

  async evaluate(
    actor: AuthorizedActor,
    permissionId: string,
    resource?: ResourceContext,
  ): Promise<AuthorizationDecision> {
    const rule = requirePermissionRule(permissionId);

    // Tenant boundary is checked before any role/grant logic at all — a
    // cross-tenant resource is NOT_FOUND regardless of what any grant
    // would otherwise allow (DoD item 11: existence must not be
    // disclosed across schools).
    if (
      actor.kind === 'SCHOOL' &&
      resource?.schoolId !== undefined &&
      resource.schoolId !== actor.schoolId
    ) {
      this.logDenial(actor, rule.id, 'cross-tenant resource');
      return { allowed: false, outcome: 'NOT_FOUND', ruleId: rule.id, requiresBreakGlass: false };
    }

    let requiresBreakGlass = false;
    for (const role of actor.roles) {
      const grant = rule.grants[role];
      if (!grant) continue;
      if (grant.kind === 'GRANTED') {
        const matches = await this.resolvers.resolve(grant.scope, actor, resource);
        if (matches) {
          return {
            allowed: true,
            outcome: 'ALLOWED',
            ruleId: rule.id,
            matchedRole: role,
            matchedScope: grant.scope,
            requiresBreakGlass: false,
          };
        }
      } else if (grant.kind === 'BREAK_GLASS') {
        requiresBreakGlass = true;
      }
      // DENIED / SYSTEM / DEFERRED: no access via this role — fall through.
    }

    this.logDenial(
      actor,
      rule.id,
      requiresBreakGlass ? 'requires break-glass' : 'no matching grant',
    );
    return { allowed: false, outcome: 'FORBIDDEN', ruleId: rule.id, requiresBreakGlass };
  }

  /** GET /v1/me/permissions: a declarative capability listing, not a
   * per-resource-instance check — no scope resolver call, no resource
   * needed. Excludes SYSTEM/DENIED/DEFERRED rows (R10: system rows are not
   * human-invokable; the rest are simply not capabilities the actor has). */
  effectivePermissions(actor: AuthorizedActor): EffectivePermission[] {
    const result: EffectivePermission[] = [];
    for (const rule of PERMISSION_TABLE) {
      let matched: { scope?: ScopePredicate; breakGlass?: boolean } | undefined;
      for (const role of actor.roles) {
        const grant = rule.grants[role];
        if (!grant) continue;
        if (grant.kind === 'GRANTED') {
          matched = { scope: grant.scope };
          break;
        }
        if (grant.kind === 'BREAK_GLASS' && !matched) {
          matched = { breakGlass: true };
        }
      }
      if (matched) {
        result.push({
          resource: rule.id,
          section: rule.section,
          label: rule.label,
          action: rule.action,
          ...matched,
        });
      }
    }
    return result;
  }

  /** B2 Security work: "Denials are logged with actor, resource, and
   * reason for the audit surface in B10." Structured application logging
   * now — B10 owns turning this into a queryable audit surface; every
   * denial as an AuditEvent row would be high-volume, routine noise
   * against 07 §11.1's own sensitive-action-only vocabulary. */
  private logDenial(actor: AuthorizedActor, ruleId: string, reason: string): void {
    const actorDescriptor =
      actor.kind === 'SCHOOL'
        ? `user=${actor.userId} school=${actor.schoolId} membership=${actor.membershipId}`
        : `platform-user=${actor.userId}`;
    this.logger.warn(`Authorization denied: ${actorDescriptor} rule=${ruleId} reason="${reason}"`);
  }
}
