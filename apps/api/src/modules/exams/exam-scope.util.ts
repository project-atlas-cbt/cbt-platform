import { prisma, withTenant, type Prisma } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';

export { requireSchoolActor, requireTeacherProfile } from '../questions/question-scope.util.js';

/**
 * ADR-0013's "at least one targeted class" rule. Resolves whether an active
 * `TeacherAssignment` exists for ANY of the candidate `ClassSubject`s, then
 * feeds the FIRST matching `classSubjectId` through the real authorization
 * engine — the same two-step shape as `question-scope.util.ts`'s own
 * `requireTeacherAssignedScope`, just widened from one candidate to N.
 *
 * Used ONLY by `exam.create` — the one exam permission graded `ASSIGNED`
 * for TEACHER. Every other TEACHER-reachable action (`editDraft`,
 * `deleteDraft`, `addQuestions`, `configure*`, `publish`, `archive`) is
 * `OWNED` and needs nothing beyond the existing `OWNED` resolver plus
 * `Exam.createdByMembershipId` in the `ResourceContext` — zero new resolver
 * code there. This is a load-bearing ordering consequence, not an
 * oversight: because only `create` carries the `ASSIGNED` gate,
 * `CreateExamDto.classIds` is required with `@ArrayMinSize(1)` — a teacher
 * cannot create an empty shell and add classes afterward with no scope
 * check ever applied, which would make this gate hollow.
 */
export async function requireTeacherAssignedToAnyClass(
  authz: AuthorizationService,
  actor: AuthorizedActor,
  permissionId: string,
  params: { schoolId: string; teacherProfileId: string; candidateClassSubjectIds: string[] },
): Promise<{ classSubjectId: string }> {
  const { schoolId, teacherProfileId, candidateClassSubjectIds } = params;
  const assignment = await withTenant(prisma, schoolId, (tx) =>
    tx.teacherAssignment.findFirst({
      where: {
        schoolId,
        teacherProfileId,
        status: 'ACTIVE',
        classSubjectId: { in: candidateClassSubjectIds },
      },
      select: { classSubjectId: true },
    }),
  );
  if (!assignment) {
    throw new AppHttpException({
      code: 'EXAM_OUT_OF_SCOPE',
      message: "You have no active assignment covering any of this exam's targeted classes.",
    });
  }
  const decision = await authz.evaluate(actor, permissionId, {
    schoolId,
    classSubjectId: assignment.classSubjectId,
  });
  if (!decision.allowed) {
    throw new AppHttpException({
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
    });
  }
  return { classSubjectId: assignment.classSubjectId };
}

export interface ResolvedClassTarget {
  classId: string;
  classSubjectId: string;
  level: string;
}

/**
 * ADR-0013: "all targeted classes must belong to the same school, session
 * and level." Enforced here, at the service layer, inside the same
 * transaction as the write — not via a novel multi-column FK scheme or a
 * trigger — mirroring `HODAssignment`'s own documented precedent exactly
 * ("a cross-table invariant... enforced at the service layer... this
 * codebase avoids triggers" for this class of check). The two things the
 * roadmap actually demands at the database-constraint level (the approved-
 * revision-only binding rule and READY-immutability) get real triggers
 * instead — see this migration's own hand-written SQL.
 *
 * Resolves each `classId` to its `ClassSubject` row for
 * `(schoolId, classId, subjectId)`, requires it be `ACTIVE`, asserts every
 * resolved row's `academicSessionId` agrees with the exam's own, and
 * asserts every resolved row's `ClassGroup.level` is identical across the
 * whole set.
 */
export async function resolveAndValidateClassTargets(
  tx: Prisma.TransactionClient,
  params: { schoolId: string; subjectId: string; academicSessionId: string; classIds: string[] },
): Promise<ResolvedClassTarget[]> {
  const { schoolId, subjectId, academicSessionId, classIds } = params;

  const classSubjects = await tx.classSubject.findMany({
    where: { schoolId, subjectId, classId: { in: classIds }, status: 'ACTIVE' },
    select: {
      id: true,
      classId: true,
      academicSessionId: true,
      classGroupSession: { select: { level: true } },
    },
  });
  const byClassId = new Map(classSubjects.map((cs) => [cs.classId, cs]));

  const resolved: ResolvedClassTarget[] = [];
  let agreedLevel: string | undefined;
  for (const classId of classIds) {
    const classSubject = byClassId.get(classId);
    if (!classSubject) {
      throw new AppHttpException({
        code: 'EXAM_CLASS_SUBJECT_NOT_OFFERED',
        message: `Class ${classId} does not currently offer this subject.`,
      });
    }
    if (classSubject.academicSessionId !== academicSessionId) {
      throw new AppHttpException({
        code: 'EXAM_CLASS_SESSION_MISMATCH',
        message: `Class ${classId}'s subject offering belongs to a different academic session.`,
      });
    }
    if (agreedLevel === undefined) {
      agreedLevel = classSubject.classGroupSession.level;
    } else if (classSubject.classGroupSession.level !== agreedLevel) {
      throw new AppHttpException({
        code: 'EXAM_CLASS_LEVEL_MISMATCH',
        message:
          'All classes targeted by one exam must share the same level (ADR-0013) — questions ' +
          'are level-scoped.',
      });
    }
    resolved.push({
      classId,
      classSubjectId: classSubject.id,
      level: classSubject.classGroupSession.level,
    });
  }
  return resolved;
}

/** Validates `academicTermId` genuinely belongs to `academicSessionId` — a
 * request-shaped check, not a composite-FK scheme (see this file's own
 * header comment for why B11 keeps `Exam.term`'s relation a plain FK). */
export async function assertTermBelongsToSession(
  tx: Prisma.TransactionClient,
  params: { schoolId: string; academicTermId: string; academicSessionId: string },
): Promise<void> {
  const term = await tx.academicTerm.findFirst({
    where: { schoolId: params.schoolId, id: params.academicTermId },
    select: { academicSessionId: true },
  });
  if (!term || term.academicSessionId !== params.academicSessionId) {
    throw new AppHttpException({
      code: 'EXAM_TERM_SESSION_MISMATCH',
      message: 'The selected term does not belong to the selected academic session.',
    });
  }
}
