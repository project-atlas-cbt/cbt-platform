import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrismaClient, prisma, withTenant, type Prisma, type PrismaClient } from '@atlas/db';
import type { Env } from '@atlas/config';
import { buildAuditFilterWhere } from './audit-query.service.js';
import type { AuditListResponseDto, PlatformAuditQueryDto } from './dto/audit.dto.js';

const DEFAULT_PAGE_SIZE = 25;

/**
 * `GET /v1/platform/audit` (`@AuthorizedPlatform('platform.audit.view')`,
 * Software-Admin-only) — the cross-school half of B10's audit retrieval.
 *
 * Owns its **own, separate `PrismaClient`**, constructed directly from
 * `DATABASE_AUDIT_READER_URL` — never the shared `prisma` singleton (that
 * one connects as `atlas_app`, scoped per-request via `withTenant`'s
 * `app.current_school_id` session variable; this one connects as
 * `atlas_audit_reader`, a role with no RLS scoping at all for
 * `audit_events` specifically, and *no grant whatsoever* on any other
 * table — see the B10 migration's own SQL for the exact mechanism). No
 * `withTenant` call site is reachable on this connection at all, which is
 * what makes "this connection never sets a tenant scope" a structural
 * fact, not a convention to remember.
 *
 * Never imported by any other service — `AuditQueryService`
 * (`GET /v1/audit`) and every other module keep using the ordinary
 * `atlas_app`/`withTenant` connection exclusively. "Audit writes go
 * through a single service; no module writes audit rows directly" (B10's
 * own Security work section) has a read-side mirror here: no module
 * queries `audit_events` cross-tenant except through this one service.
 */
@Injectable()
export class PlatformAuditReaderService implements OnModuleDestroy {
  private readonly reader: PrismaClient;

  constructor(config: ConfigService<Env, true>) {
    this.reader = createPrismaClient(config.get('DATABASE_AUDIT_READER_URL', { infer: true }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.reader.$disconnect();
  }

  async list(query: PlatformAuditQueryDto): Promise<AuditListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.AuditEventWhereInput = {
      ...buildAuditFilterWhere(query),
      ...(query.schoolId !== undefined && { schoolId: query.schoolId }),
    };

    // No app.current_school_id is ever set on this connection — the
    // additive audit_events_platform_reader policy (B10 migration) is what
    // makes every school's rows visible in one query, not a scoping
    // omission here.
    const [rows, total] = await Promise.all([
      this.reader.auditEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.reader.auditEvent.count({ where }),
    ]);

    // Follow-up, batched, per-school actor-name enrichment — through the
    // *normal* atlas_app/withTenant connection, never the privileged one,
    // keeping atlas_audit_reader's blast radius to literally the
    // audit_events table alone.
    const actorDisplayNames = await this.enrichActorDisplayNames(rows);

    return {
      items: rows.map((row) => ({
        id: row.id,
        schoolId: row.schoolId,
        actorUserId: row.actorUserId,
        actorDisplayName: actorDisplayNames.get(row.actorUserId) ?? null,
        actorRole: row.actorRole,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        reason: row.reason,
        breakGlass: row.breakGlass,
        occurredAt: row.occurredAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  private async enrichActorDisplayNames(
    rows: readonly { schoolId: string; actorUserId: string }[],
  ): Promise<Map<string, string>> {
    const bySchool = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = bySchool.get(row.schoolId) ?? new Set<string>();
      set.add(row.actorUserId);
      bySchool.set(row.schoolId, set);
    }

    const result = new Map<string, string>();
    for (const [schoolId, actorIds] of bySchool) {
      const users = await withTenant(prisma, schoolId, (tx) =>
        tx.user.findMany({
          where: { id: { in: [...actorIds] } },
          select: { id: true, displayName: true },
        }),
      );
      for (const user of users) result.set(user.id, user.displayName);
    }
    return result;
  }
}
