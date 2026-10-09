import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import {
  STANDARD_CHOICE_GROUPS,
  STANDARD_DEPARTMENTS,
  STANDARD_STREAMS,
  STANDARD_SUBJECTS,
  type Role,
  type StandardSubject,
} from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type {
  ApplyStandardSetupDto,
  StandardSetupItemStatus,
  StandardSetupPreviewResponseDto,
  StandardSetupResultResponseDto,
} from './dto/standard-setup.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

interface SchoolStructure {
  departments: { id: string; code: string; name: string }[];
  streams: { id: string; code: string; name: string }[];
  subjects: {
    id: string;
    code: string;
    name: string;
    departmentId: string | null;
    choiceGroupId: string | null;
  }[];
  groups: { id: string; name: string }[];
}

const norm = (value: string): string => value.trim().toLowerCase();

function findByCodeOrName<T extends { code: string; name: string }>(
  rows: readonly T[],
  wanted: { code: string; name: string },
): T | undefined {
  return rows.find(
    (row) => norm(row.code) === norm(wanted.code) || norm(row.name) === norm(wanted.name),
  );
}

/** A subject is matched by name first. Only a name match is ever placed in
 * a department: a code-only match may be a different subject that happens
 * to use the code, so it is left alone. */
function matchSubject(
  structure: SchoolStructure,
  subject: StandardSubject,
): { row: SchoolStructure['subjects'][number]; byName: boolean } | undefined {
  const byName = structure.subjects.find((s) => norm(s.name) === norm(subject.name));
  if (byName) return { row: byName, byName: true };
  const byCode = structure.subjects.find((s) => norm(s.code) === norm(subject.code));
  return byCode ? { row: byCode, byName: false } : undefined;
}

function subjectStatus(
  structure: SchoolStructure,
  subject: StandardSubject,
): StandardSetupItemStatus {
  const match = matchSubject(structure, subject);
  if (!match) return 'NEW';
  return match.byName && match.row.departmentId === null ? 'PLACE' : 'EXISTS';
}

const ALL_CODES: ApplyStandardSetupDto = {
  departmentCodes: STANDARD_DEPARTMENTS.map((d) => d.code),
  streamCodes: STANDARD_STREAMS.map((s) => s.code),
  subjectCodes: STANDARD_SUBJECTS.map((s) => s.code),
};

/**
 * ADR-0038 amendment (2026-10-09) — the standard setup
 * (`packages/domain/src/academics/standard-setup.ts`). The School Admin or
 * Moderator previews and applies it from setup or Academics; the Software
 * Admin can apply all of it when creating a school. It only adds what is
 * missing and places existing subjects that have no department; it never
 * moves, renames or deletes anything.
 */
@Injectable()
export class StandardSetupService {
  constructor(private readonly audit: AuditService) {}

  async preview(schoolId: string): Promise<StandardSetupPreviewResponseDto> {
    const structure = await withTenant(prisma, schoolId, (tx) => this.load(tx, schoolId));
    const departmentName = (code: string): string => {
      const standard = STANDARD_DEPARTMENTS.find((d) => d.code === code)!;
      return findByCodeOrName(structure.departments, standard)?.name ?? standard.name;
    };
    return {
      departments: STANDARD_DEPARTMENTS.map((d) => {
        const existing = findByCodeOrName(structure.departments, d);
        return {
          code: d.code,
          name: existing?.name ?? d.name,
          status: existing ? 'EXISTS' : 'NEW',
        };
      }),
      streams: STANDARD_STREAMS.map((s) => {
        const existing = findByCodeOrName(structure.streams, s);
        return {
          code: s.code,
          name: existing?.name ?? s.name,
          status: existing ? 'EXISTS' : 'NEW',
        };
      }),
      subjects: STANDARD_SUBJECTS.map((s) => {
        const group = STANDARD_CHOICE_GROUPS.find((g) => g.key === s.choiceGroupKey);
        return {
          code: s.code,
          name: matchSubject(structure, s)?.row.name ?? s.name,
          departmentCode: s.departmentCode,
          departmentName: departmentName(s.departmentCode),
          stage: s.stage,
          choiceGroupName: group ? `${group.name}: choose ${group.maxChoices}` : null,
          status: subjectStatus(structure, s),
        };
      }),
    };
  }

  async apply(
    schoolId: string,
    dto: ApplyStandardSetupDto,
    actor: ActorContext,
  ): Promise<StandardSetupResultResponseDto> {
    return runUniqueGuarded(
      () => withTenant(prisma, schoolId, (tx) => this.applyInTx(tx, schoolId, dto, actor)),
      'The school changed while this was being applied. Refresh and try again.',
    );
  }

  /** The Software Admin's "Standard setup" on Create school: everything,
   * inside the school-creation transaction (the tenant is already set). */
  async applyAllInTx(
    tx: Prisma.TransactionClient,
    schoolId: string,
    actor: ActorContext,
  ): Promise<StandardSetupResultResponseDto> {
    return this.applyInTx(tx, schoolId, ALL_CODES, actor);
  }

  private async applyInTx(
    tx: Prisma.TransactionClient,
    schoolId: string,
    dto: ApplyStandardSetupDto,
    actor: ActorContext,
  ): Promise<StandardSetupResultResponseDto> {
    const unknown = [
      ...dto.departmentCodes.filter((c) => !STANDARD_DEPARTMENTS.some((d) => d.code === c)),
      ...dto.streamCodes.filter((c) => !STANDARD_STREAMS.some((s) => s.code === c)),
      ...dto.subjectCodes.filter((c) => !STANDARD_SUBJECTS.some((s) => s.code === c)),
    ];
    if (unknown.length > 0) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: `Not part of the standard setup: ${unknown.join(', ')}.`,
      });
    }

    const structure = await this.load(tx, schoolId);
    const result: StandardSetupResultResponseDto = {
      departmentsCreated: 0,
      streamsCreated: 0,
      subjectsCreated: 0,
      subjectsPlaced: 0,
      choiceGroupsCreated: 0,
    };

    const departmentIds = new Map<string, string>();
    for (const standard of STANDARD_DEPARTMENTS) {
      const existing = findByCodeOrName(structure.departments, standard);
      if (existing) {
        departmentIds.set(standard.code, existing.id);
      } else if (dto.departmentCodes.includes(standard.code)) {
        const created = await tx.department.create({
          data: { schoolId, code: standard.code, name: standard.name },
        });
        departmentIds.set(standard.code, created.id);
        result.departmentsCreated += 1;
      }
    }

    for (const standard of STANDARD_STREAMS) {
      if (!dto.streamCodes.includes(standard.code)) continue;
      if (findByCodeOrName(structure.streams, standard)) continue;
      await tx.stream.create({ data: { schoolId, code: standard.code, name: standard.name } });
      result.streamsCreated += 1;
    }

    const groupIds = new Map<string, string>();
    const groupIdFor = async (key: string | undefined): Promise<string | null> => {
      if (!key) return null;
      const known = groupIds.get(key);
      if (known) return known;
      const standard = STANDARD_CHOICE_GROUPS.find((g) => g.key === key)!;
      const existing = structure.groups.find((g) => norm(g.name) === norm(standard.name));
      const id =
        existing?.id ??
        (
          await tx.subjectChoiceGroup.create({
            data: {
              schoolId,
              name: standard.name,
              minChoices: standard.minChoices,
              maxChoices: standard.maxChoices,
            },
          })
        ).id;
      if (!existing) result.choiceGroupsCreated += 1;
      groupIds.set(key, id);
      return id;
    };

    for (const standard of STANDARD_SUBJECTS) {
      if (!dto.subjectCodes.includes(standard.code)) continue;
      const status = subjectStatus(structure, standard);
      const departmentId = departmentIds.get(standard.departmentCode) ?? null;
      if (status === 'NEW') {
        await tx.subject.create({
          data: {
            schoolId,
            code: standard.code,
            name: standard.name,
            departmentId,
            choiceGroupId: await groupIdFor(standard.choiceGroupKey),
          },
        });
        result.subjectsCreated += 1;
      } else if (status === 'PLACE' && departmentId !== null) {
        const existing = matchSubject(structure, standard)!.row;
        await tx.subject.update({
          where: { id: existing.id },
          data: {
            departmentId,
            ...(existing.choiceGroupId === null &&
              standard.choiceGroupKey !== undefined && {
                choiceGroupId: await groupIdFor(standard.choiceGroupKey),
              }),
          },
        });
        result.subjectsPlaced += 1;
      }
    }

    await this.audit.recordInTx(tx, {
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'STANDARD_SETUP_APPLIED',
      entityType: 'School',
      entityId: schoolId,
      metadata: { ...result },
    });
    return result;
  }

  private async load(tx: Prisma.TransactionClient, schoolId: string): Promise<SchoolStructure> {
    const [departments, streams, subjects, groups] = await Promise.all([
      tx.department.findMany({ where: { schoolId }, select: { id: true, code: true, name: true } }),
      tx.stream.findMany({ where: { schoolId }, select: { id: true, code: true, name: true } }),
      tx.subject.findMany({
        where: { schoolId },
        select: { id: true, code: true, name: true, departmentId: true, choiceGroupId: true },
      }),
      tx.subjectChoiceGroup.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ]);
    return { departments, streams, subjects, groups };
  }
}
