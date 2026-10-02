import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AuditActionRegistry } from './audit-action.registry.js';

export interface RecordAuditEventInput {
  /** The *affected* school — for a break-glass action this is the target
   * school, not necessarily the actor's own (Software Admin has none). */
  schoolId: string;
  actorUserId: string;
  actorRole: Role;
  /** Free-form (see `packages/domain/src/audit/vocabulary.ts` for how 07
   * §11.1's canonical vocabulary — resolving audit finding C-02 — is
   * enforced at the application layer via `AuditActionRegistry`, not this
   * column's type). */
  action: string;
  reason?: string;
  breakGlass?: boolean;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * The single write-path for `AuditEvent` — "Audit writes go through a
 * single service; no module writes audit rows directly" (B10's own
 * Security work section, already honoured since B2, which built this
 * minimal write-only sink ahead of B10's full retrieval/vocabulary/
 * immutability apparatus for ADR-0012's break-glass requirement).
 *
 * Reads are deliberately *not* added here: `AuditQueryService`
 * (`GET /v1/audit`, the normal `atlas_app`/`withTenant` connection) and
 * `PlatformAuditReaderService` (`GET /v1/platform/audit`, the privileged
 * `atlas_audit_reader` connection) are separate services in this same
 * module — this class stays write-only, matching its own single-
 * responsibility precedent from B2.
 */
@Injectable()
export class AuditService {
  constructor(private readonly actions: AuditActionRegistry) {}

  async record(event: RecordAuditEventInput): Promise<void> {
    // B10: a write path must never hard-fail over a missing registration —
    // this only warns (deduped) so a genuine gap is loud in logs. See
    // AuditActionRegistry/AuditVocabularyCoverageService for the
    // merge-blocking half of this (whether every *canonical* action has a
    // real producer at all).
    await withTenant(prisma, event.schoolId, (tx) => this.recordInTx(tx, event));
  }

  /**
   * B20: a platform-level event with no affected school — Software Admin
   * MFA enrolment/reset, platform sign-in, operator commands. Stored with
   * `school_id` NULL under the B20 `audit_events_platform_insert` RLS policy,
   * which admits the INSERT and nothing else: atlas_app can never read
   * these rows back (only `atlas_audit_reader` can). `createMany` because
   * it issues no RETURNING, which would need SELECT visibility.
   */
  async recordPlatform(event: Omit<RecordAuditEventInput, 'schoolId'>): Promise<void> {
    this.actions.warnIfUnknown(event.action);
    await prisma.auditEvent.createMany({
      data: [
        {
          schoolId: null,
          actorUserId: event.actorUserId,
          actorRole: event.actorRole,
          action: event.action,
          breakGlass: event.breakGlass ?? false,
          ...(event.reason !== undefined && { reason: event.reason }),
          ...(event.entityType !== undefined && { entityType: event.entityType }),
          ...(event.entityId !== undefined && { entityId: event.entityId }),
          ...(event.metadata !== undefined && { metadata: event.metadata }),
        },
      ],
    });
  }

  /** Critical workflows use this variant so their state transition and its
   * audit evidence succeed or roll back together. */
  async recordInTx(tx: Prisma.TransactionClient, event: RecordAuditEventInput): Promise<void> {
    this.actions.warnIfUnknown(event.action);
    await tx.auditEvent.create({
      data: {
        schoolId: event.schoolId,
        actorUserId: event.actorUserId,
        actorRole: event.actorRole,
        action: event.action,
        breakGlass: event.breakGlass ?? false,
        ...(event.reason !== undefined && { reason: event.reason }),
        ...(event.entityType !== undefined && { entityType: event.entityType }),
        ...(event.entityId !== undefined && { entityId: event.entityId }),
        ...(event.metadata !== undefined && { metadata: event.metadata }),
      },
    });
  }
}
