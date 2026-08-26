import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';

export interface RecordAuditEventInput {
  /** The *affected* school — for a break-glass action this is the target
   * school, not necessarily the actor's own (Software Admin has none). */
  schoolId: string;
  actorUserId: string;
  actorRole: Role;
  /** Free-form for now — 07 §11.1's canonical closed vocabulary
   * (resolving audit finding C-02) is B10 scope. */
  action: string;
  reason?: string;
  breakGlass?: boolean;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Minimal, real write-path for `AuditEvent` — deliberately not the B10
 * deliverable (canonical action vocabulary, retrieval endpoints, DB-
 * enforced immutability trigger, retention policy; see AuditEvent's own
 * schema doc comment). B2 needs a genuine sink now for ADR-0012's break-
 * glass requirement ("emits an elevated audit event"), the same shape of
 * decision as B0 shipping a minimal NotificationChannel ahead of B10's
 * full notification apparatus.
 *
 * Write-only by design: nothing in this module reads AuditEvent back.
 * "Audit writes go through a single service; no module writes audit rows
 * directly" (B10's own Security work section, honoured a phase early) —
 * BreakGlassService is this service's only caller in B2.
 */
@Injectable()
export class AuditService {
  async record(event: RecordAuditEventInput): Promise<void> {
    await withTenant(prisma, event.schoolId, (tx) =>
      tx.auditEvent.create({
        data: {
          schoolId: event.schoolId,
          actorUserId: event.actorUserId,
          actorRole: event.actorRole,
          action: event.action,
          breakGlass: event.breakGlass ?? false,
          // exactOptionalPropertyTypes: an explicit `undefined` is not the
          // same as an absent key, so optional fields are spread in only
          // when actually provided.
          ...(event.reason !== undefined && { reason: event.reason }),
          ...(event.entityType !== undefined && { entityType: event.entityType }),
          ...(event.entityId !== undefined && { entityId: event.entityId }),
          ...(event.metadata !== undefined && { metadata: event.metadata }),
        },
      }),
    );
  }
}
