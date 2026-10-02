import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type {
  AuditEventResponseDto,
  AuditListResponseDto,
  AuditQueryDto,
} from './dto/audit.dto.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';

const DEFAULT_PAGE_SIZE = 25;

function toResponseDto(
  event: {
    id: string;
    schoolId: string | null;
    actorUserId: string;
    actorRole: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    reason: string | null;
    breakGlass: boolean;
    occurredAt: Date;
  },
  actorDisplayNames: Map<string, string>,
): AuditEventResponseDto {
  return {
    id: event.id,
    schoolId: event.schoolId,
    actorUserId: event.actorUserId,
    actorDisplayName: actorDisplayNames.get(event.actorUserId) ?? null,
    actorRole: event.actorRole as AuditEventResponseDto['actorRole'],
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    reason: event.reason,
    breakGlass: event.breakGlass,
    occurredAt: event.occurredAt.toISOString(),
  };
}

/** Shared filter-clause builder — `GET /v1/audit` (this service, real
 * `atlas_app`/RLS connection) and `PlatformAuditReaderService`
 * (`GET /v1/platform/audit`, the privileged `atlas_audit_reader`
 * connection) both need the same actor/action/entityType/date-range shape;
 * only the scoping clause (school vs. cross-school) differs. */
export function buildAuditFilterWhere(
  query: Pick<AuditQueryDto, 'actorUserId' | 'action' | 'entityType' | 'from' | 'to'>,
): Prisma.AuditEventWhereInput {
  const where: Prisma.AuditEventWhereInput = {};
  if (query.actorUserId !== undefined) where.actorUserId = query.actorUserId;
  if (query.action !== undefined) where.action = query.action;
  if (query.entityType !== undefined) where.entityType = query.entityType;
  if (query.from !== undefined || query.to !== undefined) {
    where.occurredAt = {
      ...(query.from !== undefined && { gte: new Date(query.from) }),
      ...(query.to !== undefined && { lte: new Date(query.to) }),
    };
  }
  return where;
}

/**
 * `GET /v1/audit` — school-session-scoped retrieval (`@Authorized(
 * 'audit.viewLog')`), reachable by all six roles via the normal `AuthGuard`
 * (never the privileged `atlas_audit_reader` connection — that's
 * `PlatformAuditReaderService`'s job, for the Software-Admin-only,
 * cross-school `GET /v1/platform/audit` instead).
 *
 * Per-role scoping (`02`: Software Admin full, School Admin own school,
 * Moderator full [school-wide read-only per `audit.viewLog`'s finalized
 * grant], HOD department, Teacher own actions, Student own account) lives
 * entirely here, not in a generic scope resolver — the guard passes
 * optimistically on this list route (no single resource to check), same
 * as every other list endpoint in this codebase.
 */
@Injectable()
export class AuditQueryService {
  async list(
    schoolId: string,
    actor: AuthorizedActor,
    query: AuditQueryDto,
  ): Promise<AuditListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const filterWhere = buildAuditFilterWhere(query);

    const { rows, total, actorDisplayNames } = await withTenant(prisma, schoolId, async (tx) => {
      const scopeWhere = await this.resolveScope(tx, schoolId, actor);
      // scopeWhere === null means "no role of this actor's can see anything
      // here" (e.g. an HOD holding no active department assignment) —
      // short-circuit rather than issue a query guaranteed to return zero
      // rows anyway.
      if (scopeWhere === null) {
        return { rows: [], total: 0, actorDisplayNames: new Map<string, string>() };
      }

      const where: Prisma.AuditEventWhereInput = { schoolId, ...filterWhere, ...scopeWhere };
      const [rows, total] = await Promise.all([
        tx.auditEvent.findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.auditEvent.count({ where }),
      ]);

      // Best-effort actor display-name enrichment, same transaction (this
      // endpoint is already single-school, so no cross-school batching is
      // needed the way PlatformAuditReaderService's is).
      const actorIds = [...new Set(rows.map((r) => r.actorUserId))];
      const users =
        actorIds.length > 0
          ? await tx.user.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, displayName: true },
            })
          : [];
      const actorDisplayNames = new Map(users.map((u) => [u.id, u.displayName]));

      return { rows, total, actorDisplayNames };
    });

    return {
      items: rows.map((row) => toResponseDto(row, actorDisplayNames)),
      total,
      page,
      pageSize,
    };
  }

  /** `null` scope clause is used as "returns nothing" (short-circuit,
   * above); an empty object `{}` means "no additional restriction beyond
   * schoolId" (full school read). */
  private async resolveScope(
    tx: Prisma.TransactionClient,
    schoolId: string,
    actor: AuthorizedActor,
  ): Promise<Prisma.AuditEventWhereInput | null> {
    if (actor.kind !== 'SCHOOL') {
      // Software Admin's grant on this row (platformRead()) is presently
      // unreachable in practice — AuthGuard requires a school session
      // Software Admin never has; real platform audit access is
      // GET /v1/platform/audit instead. Implemented for correctness, not
      // silently dropped.
      return {};
    }

    if (actor.roles.includes('SCHOOL_ADMIN') || actor.roles.includes('MODERATOR')) {
      return {};
    }

    if (actor.roles.includes('HOD')) {
      const assignments = await tx.hODAssignment.findMany({
        where: { schoolId, membershipId: actor.membershipId, status: 'ACTIVE' },
        select: { departmentId: true },
      });
      const departmentIds = assignments.map((a) => a.departmentId);
      if (departmentIds.length === 0) {
        // No active department — HOD still sees their own actions.
        return { actorUserId: actor.userId };
      }

      // Documented gap (B10): the only entityType this schema can resolve
      // back to a department is Question/QuestionRevision (via
      // Subject.departmentId), mirroring question-review.service.ts's own
      // two-hop join. Any other entityType has no generic polymorphic path
      // back to a department, so an HOD sees own actions + this subset
      // only — not silently narrowed, this is the real, complete boundary.
      const subjects = await tx.subject.findMany({
        where: { schoolId, departmentId: { in: departmentIds } },
        select: { id: true },
      });
      const subjectIds = subjects.map((s) => s.id);
      const questions =
        subjectIds.length > 0
          ? await tx.question.findMany({
              where: { schoolId, subjectId: { in: subjectIds } },
              select: { id: true },
            })
          : [];
      const questionIds = questions.map((q) => q.id);
      const revisions =
        questionIds.length > 0
          ? await tx.questionRevision.findMany({
              where: { schoolId, questionId: { in: questionIds } },
              select: { id: true },
            })
          : [];
      const revisionIds = revisions.map((r) => r.id);

      const departmentEntityIds = [...questionIds, ...revisionIds];
      return {
        OR: [
          { actorUserId: actor.userId },
          ...(departmentEntityIds.length > 0
            ? [
                {
                  entityType: { in: ['Question', 'QuestionRevision'] },
                  entityId: { in: departmentEntityIds },
                },
              ]
            : []),
        ],
      };
    }

    // TEACHER / STUDENT: "own actions" / "own account" both resolve to
    // actor identity — AuditEvent has no distinct "subject of the action"
    // field, and exposing e.g. a raw STUDENT_DEACTIVATED admin event to
    // the deactivated student would conflate the audit trail with the
    // Notification system this same phase builds for exactly that purpose.
    return { actorUserId: actor.userId };
  }
}
