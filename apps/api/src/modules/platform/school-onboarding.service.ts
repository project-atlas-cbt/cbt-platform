import { Injectable } from '@nestjs/common';
import { prisma, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { AcademicsContextService } from '../academics/academics-context.service.js';
import { ClassGroupService } from '../academics/class-group.service.js';
import type {
  OnboardingStatusResponseDto,
  UpdateOnboardingProgressDto,
} from './dto/school-onboarding.dto.js';

interface OnboardingStateShape {
  currentStep: number;
  skippedSteps: number[];
}

const DEFAULT_STATE: OnboardingStateShape = { currentStep: 1, skippedSteps: [] };

function toStateShape(value: unknown): OnboardingStateShape {
  if (value === null || typeof value !== 'object') return DEFAULT_STATE;
  const raw = value as Partial<OnboardingStateShape>;
  return {
    currentStep: typeof raw.currentStep === 'number' ? raw.currentStep : DEFAULT_STATE.currentStep,
    skippedSteps: Array.isArray(raw.skippedSteps) ? raw.skippedSteps : DEFAULT_STATE.skippedSteps,
  };
}

/**
 * F4's gap-closure: `School` had no onboarding-completion concept at all
 * before this phase — see CLAUDE.md's F4 Change Log entry for the full
 * reasoning (confirmed with the project owner as a small, additive
 * backend addition, the same shape as B3/B4/F3's own precedent
 * gap-closures). `actorRole` is hardcoded 'SCHOOL_ADMIN' below, mirroring
 * `SchoolBrandingService`'s identical precedent — this permission id's
 * grant table denies every other school role, so no other role can ever
 * reach these methods.
 */
@Injectable()
export class SchoolOnboardingService {
  constructor(
    private readonly audit: AuditService,
    private readonly academicsContext: AcademicsContextService,
    private readonly classGroups: ClassGroupService,
  ) {}

  async getProgress(schoolId: string): Promise<OnboardingStatusResponseDto> {
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { onboardingCompletedAt: true, onboardingState: true },
    });
    const state = toStateShape(school.onboardingState);
    return {
      completedAt: school.onboardingCompletedAt?.toISOString() ?? null,
      currentStep: state.currentStep,
      skippedSteps: state.skippedSteps,
    };
  }

  async updateProgress(
    schoolId: string,
    dto: UpdateOnboardingProgressDto,
  ): Promise<OnboardingStatusResponseDto> {
    const existing = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { onboardingCompletedAt: true, onboardingState: true },
    });
    if (existing.onboardingCompletedAt !== null) {
      throw new AppHttpException({
        code: 'ONBOARDING_ALREADY_COMPLETE',
        message: 'This school has already completed onboarding.',
      });
    }
    const currentState = toStateShape(existing.onboardingState);
    const nextState: OnboardingStateShape = {
      currentStep: dto.currentStep,
      skippedSteps: dto.skippedSteps ?? currentState.skippedSteps,
    };
    await prisma.school.update({
      where: { id: schoolId },
      data: { onboardingState: nextState as unknown as Prisma.InputJsonValue },
    });
    return { completedAt: null, ...nextState };
  }

  async complete(schoolId: string, actorUserId: string): Promise<OnboardingStatusResponseDto> {
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { onboardingCompletedAt: true, onboardingState: true },
    });
    const state = toStateShape(school.onboardingState);

    // Idempotent: a second call after completion is a successful no-op, not
    // an error — the wizard's own "Complete Setup" button may be pressed
    // more than once in flight (double-click, a retried request) without
    // that being treated as re-entry.
    if (school.onboardingCompletedAt !== null) {
      return { completedAt: school.onboardingCompletedAt.toISOString(), ...state };
    }

    // 05 §5.2's two hard blockers, re-checked server-side — never trusted
    // from the client alone (AGENTS.md §5/§6). Reuses the existing
    // AcademicsContextService/ClassGroupService rather than duplicating
    // their queries.
    const context = await this.academicsContext.get(schoolId);
    if (context.session === null) {
      throw new AppHttpException({
        code: 'ONBOARDING_FUNDAMENTALS_MISSING',
        message: 'A current academic session is required before setup can be completed.',
      });
    }
    const classGroups = await this.classGroups.list(schoolId);
    if (!classGroups.some((c) => c.status !== 'ARCHIVED')) {
      throw new AppHttpException({
        code: 'ONBOARDING_FUNDAMENTALS_MISSING',
        message: 'At least one class is required before setup can be completed.',
      });
    }

    const completedAt = new Date();
    await prisma.school.update({
      where: { id: schoolId },
      data: { onboardingCompletedAt: completedAt },
    });
    await this.audit.record({
      schoolId,
      actorUserId,
      actorRole: 'SCHOOL_ADMIN',
      action: 'SCHOOL_ONBOARDING_COMPLETED',
      entityType: 'School',
      entityId: schoolId,
    });
    return { completedAt: completedAt.toISOString(), ...state };
  }
}
