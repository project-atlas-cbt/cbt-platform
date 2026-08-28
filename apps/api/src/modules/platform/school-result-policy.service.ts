import { Injectable } from '@nestjs/common';
import { prisma } from '@atlas/db';
import type { ResultDetailVisibility, ResultPolicy } from '@atlas/domain';
import { AuditService } from '../operations/audit-event.service.js';
import type {
  SchoolResultPolicyResponseDto,
  UpdateSchoolResultPolicyDto,
} from './dto/school-result-policy.dto.js';

const SELECT = {
  resultPolicy: true,
  resultDetailVisibility: true,
  resultPolicyLocked: true,
} as const;

/**
 * `GET/PUT /v1/school/result-policy` — F5/B3 gap-closure (05 §47, ADR-0010's
 * "Required changes: B5/B3: school-level defaults and the lock flag", never
 * actually built there). Reachable only through a school session
 * (`@Authorized`), so only SCHOOL_ADMIN can ever pass
 * `schoolConfig.settings.manage`'s grant for the PUT — `actorRole` is
 * therefore hardcoded below, mirroring `SchoolBrandingService`'s identical
 * precedent for a route only one role can ever reach.
 *
 * These are *defaults* only — no B11 `Exam` row exists yet to seed from
 * them, and no B15 `ResultPublication`/marking logic exists yet to honour
 * `resultPolicyLocked`. This service's job is exactly and only to store the
 * school's chosen defaults, correctly and auditably, ahead of the phases
 * that will read them.
 */
@Injectable()
export class SchoolResultPolicyService {
  constructor(private readonly audit: AuditService) {}

  async getResultPolicy(schoolId: string): Promise<SchoolResultPolicyResponseDto> {
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: SELECT,
    });
    return school;
  }

  async updateResultPolicy(
    schoolId: string,
    actorUserId: string,
    dto: UpdateSchoolResultPolicyDto,
  ): Promise<SchoolResultPolicyResponseDto> {
    const before = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: SELECT,
    });

    const data: {
      resultPolicy?: ResultPolicy;
      resultDetailVisibility?: ResultDetailVisibility;
      resultPolicyLocked?: boolean;
    } = {};
    if (dto.resultPolicy !== undefined) data.resultPolicy = dto.resultPolicy;
    if (dto.resultDetailVisibility !== undefined) {
      data.resultDetailVisibility = dto.resultDetailVisibility;
    }
    if (dto.resultPolicyLocked !== undefined) data.resultPolicyLocked = dto.resultPolicyLocked;

    if (Object.keys(data).length > 0) {
      await prisma.school.update({ where: { id: schoolId }, data });
      // Freely editable at any time, like branding (no "one-time" lock on
      // the settings themselves — resultPolicyLocked only governs whether a
      // *teacher* may override the seeded per-exam value, once B11 exists).
      await this.audit.record({
        schoolId,
        actorUserId,
        actorRole: 'SCHOOL_ADMIN',
        action: 'SCHOOL_RESULT_POLICY_CHANGED',
        entityType: 'School',
        entityId: schoolId,
        metadata: { before, after: { ...before, ...data } },
      });
    }

    const after = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: SELECT,
    });
    return after;
  }
}
