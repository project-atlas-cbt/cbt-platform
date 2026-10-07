import { Injectable } from '@nestjs/common';
import { prisma } from '@atlas/db';
import { AuditService } from '../operations/audit-event.service.js';
import type {
  SchoolAssessmentRulesResponseDto,
  UpdateSchoolAssessmentRulesDto,
} from './dto/school-assessment-rules.dto.js';

export const SCHOOL_ASSESSMENT_RULES_CHANGED_ACTION = 'SCHOOL_ASSESSMENT_RULES_CHANGED';

const SELECT = {
  defaultExamDurationSeconds: true,
  defaultAttemptLimit: true,
  defaultNavigationPolicy: true,
  defaultRandomizeQuestions: true,
  defaultRandomizeOptions: true,
} as const;

/**
 * `GET/PUT /v1/school/assessment-rules` — the school's exam defaults
 * (05 §58 "Default duration rules", "Attempt policy"; 03 §26). They seed a
 * new exam's own rule fields in `ExamService.create`; a teacher can change
 * every one of them on that exam's Rules step (owner decision 2026-10-06:
 * editable defaults, no lock). Only SCHOOL_ADMIN holds
 * `schoolConfig.settings.manage`, so `actorRole` is hardcoded, as in
 * `SchoolResultPolicyService`.
 */
@Injectable()
export class SchoolAssessmentRulesService {
  constructor(private readonly audit: AuditService) {}

  async getAssessmentRules(schoolId: string): Promise<SchoolAssessmentRulesResponseDto> {
    return prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: SELECT });
  }

  async updateAssessmentRules(
    schoolId: string,
    actorUserId: string,
    dto: UpdateSchoolAssessmentRulesDto,
  ): Promise<SchoolAssessmentRulesResponseDto> {
    const before = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: SELECT,
    });

    const data: Partial<SchoolAssessmentRulesResponseDto> = {};
    if (dto.defaultExamDurationSeconds !== undefined) {
      data.defaultExamDurationSeconds = dto.defaultExamDurationSeconds;
    }
    if (dto.defaultAttemptLimit !== undefined) data.defaultAttemptLimit = dto.defaultAttemptLimit;
    if (dto.defaultNavigationPolicy !== undefined) {
      data.defaultNavigationPolicy = dto.defaultNavigationPolicy;
    }
    if (dto.defaultRandomizeQuestions !== undefined) {
      data.defaultRandomizeQuestions = dto.defaultRandomizeQuestions;
    }
    if (dto.defaultRandomizeOptions !== undefined) {
      data.defaultRandomizeOptions = dto.defaultRandomizeOptions;
    }

    const after = { ...before, ...data };
    const changed = (Object.keys(data) as (keyof typeof data)[]).some(
      (key) => before[key] !== after[key],
    );
    if (!changed) return before;

    await prisma.school.update({ where: { id: schoolId }, data });
    await this.audit.record({
      schoolId,
      actorUserId,
      actorRole: 'SCHOOL_ADMIN',
      action: SCHOOL_ASSESSMENT_RULES_CHANGED_ACTION,
      entityType: 'School',
      entityId: schoolId,
      metadata: { before, after },
    });
    return after;
  }
}
