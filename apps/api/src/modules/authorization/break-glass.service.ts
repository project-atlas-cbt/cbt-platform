import { Injectable } from '@nestjs/common';
import type { Prisma } from '@atlas/db';
import { requirePermissionRule } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import type { AuthorizedActor } from './authorization.types.js';

export interface BreakGlassParams {
  /** The school the write affects — visible to that school's own audit
   * view per ADR-0012, regardless of the actor's own (absent) school. */
  schoolId: string;
  /** A PERMISSION_TABLE row id whose SOFTWARE_ADMIN grant is BREAK_GLASS. */
  permissionId: string;
  reason: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * ADR-0012's break-glass path: "a distinct, monitorable code path rather
 * than an invisible superuser bypass." Never a substitute for an ordinary
 * GRANTED scope — a caller invokes this explicitly, it is not something
 * PermissionGuard/AuthorizationService.evaluate() ever grants on its own
 * (evaluate() only ever reports `requiresBreakGlass`, never `allowed` for
 * a BREAK_GLASS-kind grant).
 *
 * No controller in B2 calls this yet — no school-academic-write endpoint
 * a Software Admin could reach exists before B3+. Proven here as a real,
 * tested primitive (unit + integration, with a synthetic protected
 * operation) that those phases wire a real write into, per the
 * 2026-08-26 decision to test break-glass via direct actor fixtures
 * rather than a real login flow.
 */
@Injectable()
export class BreakGlassService {
  constructor(private readonly audit: AuditService) {}

  async execute<T>(
    actor: AuthorizedActor,
    params: BreakGlassParams,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (actor.kind !== 'PLATFORM' || !actor.roles.includes('SOFTWARE_ADMIN')) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'Break-glass access requires an authenticated Software Admin.',
      });
    }

    const rule = requirePermissionRule(params.permissionId);
    if (rule.grants.SOFTWARE_ADMIN.kind !== 'BREAK_GLASS') {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: `"${params.permissionId}" is not a break-glass-eligible action for Software Admin.`,
      });
    }

    if (!params.reason.trim()) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'A reason is required for break-glass access.',
      });
    }

    const result = await fn();

    await this.audit.record({
      schoolId: params.schoolId,
      actorUserId: actor.userId,
      actorRole: 'SOFTWARE_ADMIN',
      action: `BREAK_GLASS_${params.permissionId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
      reason: params.reason,
      breakGlass: true,
      ...(params.entityType !== undefined && { entityType: params.entityType }),
      ...(params.entityId !== undefined && { entityId: params.entityId }),
      ...(params.metadata !== undefined && { metadata: params.metadata }),
    });

    return result;
  }
}
