import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';

/**
 * Results are scoped through their EXAM, never independently: `02`'s matrix
 * grades every Results row against the same shape as the exam that produced
 * them (School Admin/Moderator school-wide, HOD department, Teacher own
 * exams). So this mirrors `ExamService.resolveViewResourceContext()` rather
 * than inventing a second scoping scheme — the same three-field
 * `ResourceContext` the authorization engine already understands.
 *
 * Duplicated deliberately rather than exported from `ExamsModule`: reaching
 * into another module's private service method would mean either a DI edge
 * this module does not otherwise need, or making an internal method public
 * for one caller. `exam-scope.util.ts`'s own precedent (a plain function,
 * importable without a DI edge) is followed for `loadExamOrThrow`, which
 * IS a plain export and is reused as-is.
 */
export interface ResultResourceContext {
  schoolId: string;
  ownerMembershipId: string;
  departmentId?: string;
  classSubjectId?: string;
}

export interface ExamForResultScope {
  createdByMembershipId: string;
  departmentId: string | null;
  classes: { classSubjectId: string }[];
}

export async function resolveResultResourceContext(
  schoolId: string,
  actor: AuthorizedActor,
  exam: ExamForResultScope,
): Promise<ResultResourceContext> {
  let classSubjectId: string | undefined;

  if (actor.kind === 'SCHOOL' && actor.roles.includes('TEACHER')) {
    const teacherProfile = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId: actor.membershipId } },
        select: { id: true },
      }),
    );

    const examClassSubjectIds = exam.classes.map((c) => c.classSubjectId);
    if (teacherProfile && examClassSubjectIds.length > 0) {
      const assignment = await withTenant(prisma, schoolId, (tx) =>
        tx.teacherAssignment.findFirst({
          where: {
            schoolId,
            teacherProfileId: teacherProfile.id,
            status: 'ACTIVE',
            classSubjectId: { in: examClassSubjectIds },
          },
          select: { classSubjectId: true },
        }),
      );
      classSubjectId = assignment?.classSubjectId;
    }
  }

  return {
    schoolId,
    ownerMembershipId: exam.createdByMembershipId,
    ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    ...(classSubjectId !== undefined && { classSubjectId }),
  };
}

/**
 * The exam's creator always retains access to its own results, exactly as
 * `ExamService` already treats exam access — a teacher whose class-subject
 * assignment has since ended must not lose sight of an exam they authored
 * and administered.
 */
export function isExamCreator(actor: AuthorizedActor, exam: ExamForResultScope): boolean {
  return actor.kind === 'SCHOOL' && actor.membershipId === exam.createdByMembershipId;
}

/** School-side actors only. A platform (Software Admin) session has no
 * `SchoolMembership`, and `02` denies Software Admin every publish/adjust
 * row outright, so nothing in this module is reachable by one. */
export function requireSchoolActorForResults(
  actor: AuthorizedActor,
): Extract<AuthorizedActor, { kind: 'SCHOOL' }> {
  if (actor.kind !== 'SCHOOL') {
    throw new AppHttpException({
      code: 'FORBIDDEN',
      message: 'This action is only available to a school user.',
    });
  }
  return actor;
}

/**
 * The role to attribute an audit event to. A membership may hold more than
 * one role (Teacher + HOD is explicitly supported by `07 §5.3`), so the most
 * administratively senior one that actually holds the permission is the
 * honest attribution — an HOD acting as HOD should not have their action
 * filed under TEACHER simply because that role sorts first.
 */
export function auditRoleFor(actor: Extract<AuthorizedActor, { kind: 'SCHOOL' }>): Role {
  const precedence: Role[] = ['SCHOOL_ADMIN', 'MODERATOR', 'HOD', 'TEACHER', 'STUDENT'];
  return precedence.find((role) => actor.roles.includes(role)) ?? 'TEACHER';
}
