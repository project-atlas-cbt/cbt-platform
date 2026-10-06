import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import {
  DEFAULT_GRADING_SCALE_TEMPLATE,
  validateGradingBands,
  type GradingBand,
} from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { decimalToNumber } from './result-mappers.js';
import { auditRoleFor, requireSchoolActorForResults } from './result-scope.util.js';
import type {
  GradingScaleListResponseDto,
  GradingScaleResponseDto,
  GradingScaleVersionListResponseDto,
  GradingScaleVersionResponseDto,
  PutGradingScaleDto,
} from './dto/grading-scale.dto.js';

interface ActorContext {
  actorUserId: string;
}

const VERSION_INCLUDE = {
  bands: { orderBy: { sortOrder: 'asc' as const } },
} as const;

/**
 * ADR-0018 — school-owned, versioned grading scales (resolving audit M-06,
 * a gap `07` leaves entirely: there is no GradingScale in the ERD at all).
 *
 * The rule this service exists to hold: editing a scale creates a NEW
 * version rather than mutating bands. A result stores both its grade and the
 * `grading_scale_version_id` that produced it, so history stays explainable
 * — and the database backs this up with a trigger that freezes any version
 * a result has actually been graded against.
 *
 * Gated by `schoolConfig.settings.*` rather than its own permission pair:
 * `04 §19` puts grading under School Settings beside Result Visibility, and
 * F5 already established that precedent for the sibling result-policy axis.
 */
@Injectable()
export class GradingScaleService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async list(schoolId: string, actor: AuthorizedActor): Promise<GradingScaleListResponseDto> {
    await this.assertAllowed(actor, 'schoolConfig.settings.view', schoolId);

    const scales = await withTenant(prisma, schoolId, (tx) =>
      tx.gradingScale.findMany({
        where: { schoolId, archivedAt: null },
        include: { currentVersion: { include: VERSION_INCLUDE } },
        orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
      }),
    );

    const usedVersionIds = await this.usedVersionIds(
      schoolId,
      scales.map((s) => s.currentVersionId).filter((id): id is string => id !== null),
    );

    return {
      items: scales.map((scale) => this.toScaleDto(scale, usedVersionIds)),
      defaultTemplate: DEFAULT_GRADING_SCALE_TEMPLATE.map((band) => ({ ...band })),
    };
  }

  async listVersions(
    schoolId: string,
    actor: AuthorizedActor,
    scaleId: string,
  ): Promise<GradingScaleVersionListResponseDto> {
    await this.assertAllowed(actor, 'schoolConfig.settings.view', schoolId);

    const scale = await withTenant(prisma, schoolId, (tx) =>
      tx.gradingScale.findUnique({ where: { id: scaleId }, select: { id: true } }),
    );
    if (!scale) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Grading scale not found.' });
    }

    const versions = await withTenant(prisma, schoolId, (tx) =>
      tx.gradingScaleVersion.findMany({
        where: { schoolId, scaleId },
        include: VERSION_INCLUDE,
        orderBy: { versionNumber: 'desc' },
      }),
    );

    const usedVersionIds = await this.usedVersionIds(
      schoolId,
      versions.map((v) => v.id),
    );

    return { items: versions.map((v) => this.toVersionDto(v, usedVersionIds)) };
  }

  /**
   * Create a scale, or add a version to an existing one. Never an in-place
   * band edit — that is ADR-0018's central decision, and the database
   * enforces it independently for any version that has already graded a
   * result.
   */
  async put(
    schoolId: string,
    actor: AuthorizedActor,
    dto: PutGradingScaleDto,
    ctx: ActorContext,
  ): Promise<GradingScaleResponseDto> {
    const schoolActor = requireSchoolActorForResults(actor);
    await this.assertAllowed(actor, 'schoolConfig.settings.manage', schoolId);

    const bands: GradingBand[] = dto.bands.map((b) => ({
      label: b.label.trim(),
      minPercentage: b.minPercentage,
      maxPercentage: b.maxPercentage,
      isPassing: b.isPassing,
    }));

    const issues = validateGradingBands(bands);
    if (issues.length > 0) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: `Grading scale bands are invalid: ${issues.map((i) => i.message).join(' ')}`,
      });
    }

    const scaleId = await withTenant(prisma, schoolId, async (tx) => {
      // P3-5: two first saves at once would each find no scale for the level
      // and each create one. Saves for a school are serialised instead.
      // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`grading-scale:${schoolId}`}))`;

      let scale = dto.scaleId
        ? await tx.gradingScale.findUnique({ where: { id: dto.scaleId } })
        : null;

      if (dto.scaleId && (!scale || scale.archivedAt)) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Grading scale not found.' });
      }
      // P3-5: a scale keeps its level. Moving one onto another level would
      // leave that level with two active scales.
      if (scale && (scale.level ?? null) !== (dto.level ?? null)) {
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message: "A grading scale's level can't be changed. Save a scale for that level instead.",
        });
      }

      // At most ONE active scale per level scope, including the school-wide
      // (level = null) default. Without this, a second submission for the
      // same scope would create a rival scale and `resolveScaleForLevel`
      // would have two equally-valid candidates to choose between — an
      // ambiguity that decides real students' grades by row order. So a
      // submission naming no scaleId versions the existing scale for that
      // scope rather than creating a competitor. A school that genuinely
      // wants a different scale per level supplies a different `level`.
      scale ??= await tx.gradingScale.findFirst({
        where: { schoolId, level: dto.level ?? null, archivedAt: null },
      });

      scale ??= await tx.gradingScale.create({
        data: {
          schoolId,
          name: dto.name.trim(),
          level: dto.level ?? null,
          createdByMembershipId: schoolActor.membershipId,
        },
      });

      const latest = await tx.gradingScaleVersion.findFirst({
        where: { schoolId, scaleId: scale.id },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });

      const version = await tx.gradingScaleVersion.create({
        data: {
          schoolId,
          scaleId: scale.id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          createdByMembershipId: schoolActor.membershipId,
        },
      });

      await tx.gradingScaleBand.createMany({
        data: bands.map((band, index) => ({
          schoolId,
          versionId: version.id,
          label: band.label,
          minPercentage: band.minPercentage,
          maxPercentage: band.maxPercentage,
          isPassing: band.isPassing,
          sortOrder: index,
        })),
      });

      await tx.gradingScale.update({
        where: { id: scale.id },
        data: {
          name: dto.name.trim(),
          level: dto.level ?? null,
          currentVersionId: version.id,
        },
      });

      return scale.id;
    });

    await this.audit.record({
      schoolId,
      actorUserId: ctx.actorUserId,
      actorRole: auditRoleFor(schoolActor),
      action: 'GRADING_SCALE_VERSION_CREATED',
      entityType: 'GradingScale',
      entityId: scaleId,
      metadata: { name: dto.name, level: dto.level ?? null, bandCount: bands.length },
    });

    const saved = await withTenant(prisma, schoolId, (tx) =>
      tx.gradingScale.findUniqueOrThrow({
        where: { id: scaleId },
        include: { currentVersion: { include: VERSION_INCLUDE } },
      }),
    );
    const usedVersionIds = await this.usedVersionIds(
      schoolId,
      saved.currentVersionId ? [saved.currentVersionId] : [],
    );
    return this.toScaleDto(saved, usedVersionIds);
  }

  /**
   * Resolves the scale version a result finalised at this level should be
   * graded against: the most specific match wins — a scale scoped to the
   * student's own class level, else the school-wide default (ADR-0018's
   * "optional level scoping ... supports both without forcing either").
   *
   * Returns `null` when the school has configured nothing, which is a fully
   * supported state: raw marks and percentage remain authoritative
   * regardless of grading configuration (05 §46, DoD item 9).
   */
  async resolveScaleForLevel(
    schoolId: string,
    level: string | null,
  ): Promise<{ versionId: string; bands: GradingBand[] } | null> {
    const scales = await withTenant(prisma, schoolId, (tx) =>
      tx.gradingScale.findMany({
        where: {
          schoolId,
          archivedAt: null,
          currentVersionId: { not: null },
          OR: [{ level: null }, ...(level ? [{ level: level as never }] : [])],
        },
        include: { currentVersion: { include: VERSION_INCLUDE } },
      }),
    );

    const exact = scales.find((s) => s.level !== null && s.level === level);
    const fallback = scales.find((s) => s.level === null);
    const chosen = exact ?? fallback;
    if (!chosen?.currentVersion) return null;

    return {
      versionId: chosen.currentVersion.id,
      bands: chosen.currentVersion.bands.map((b) => ({
        label: b.label,
        minPercentage: decimalToNumber(b.minPercentage),
        maxPercentage: decimalToNumber(b.maxPercentage),
        isPassing: b.isPassing,
      })),
    };
  }

  private async usedVersionIds(
    schoolId: string,
    versionIds: string[],
  ): Promise<ReadonlySet<string>> {
    if (versionIds.length === 0) return new Set();
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.result.findMany({
        where: { schoolId, gradingScaleVersionId: { in: versionIds } },
        select: { gradingScaleVersionId: true },
        distinct: ['gradingScaleVersionId'],
      }),
    );
    return new Set(rows.map((r) => r.gradingScaleVersionId).filter((id): id is string => !!id));
  }

  private toScaleDto(
    scale: {
      id: string;
      name: string;
      level: string | null;
      updatedAt: Date;
      currentVersion: (Parameters<GradingScaleService['toVersionDto']>[0] & { id: string }) | null;
    },
    usedVersionIds: ReadonlySet<string>,
  ): GradingScaleResponseDto {
    return {
      id: scale.id,
      name: scale.name,
      level: scale.level as GradingScaleResponseDto['level'],
      currentVersion: scale.currentVersion
        ? this.toVersionDto(scale.currentVersion, usedVersionIds)
        : null,
      updatedAt: scale.updatedAt.toISOString(),
    };
  }

  private toVersionDto(
    version: {
      id: string;
      versionNumber: number;
      createdAt: Date;
      bands: {
        label: string;
        minPercentage: unknown;
        maxPercentage: unknown;
        isPassing: boolean;
      }[];
    },
    usedVersionIds: ReadonlySet<string>,
  ): GradingScaleVersionResponseDto {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt.toISOString(),
      bands: version.bands.map((b) => ({
        label: b.label,
        minPercentage: decimalToNumber(b.minPercentage as never),
        maxPercentage: decimalToNumber(b.maxPercentage as never),
        isPassing: b.isPassing,
      })),
      inUse: usedVersionIds.has(version.id),
    };
  }

  private async assertAllowed(
    actor: AuthorizedActor,
    permissionId: 'schoolConfig.settings.view' | 'schoolConfig.settings.manage',
    schoolId: string,
  ): Promise<void> {
    const decision = await this.authz.evaluate(actor, permissionId, { schoolId });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to manage grading configuration.',
      });
    }
  }
}
