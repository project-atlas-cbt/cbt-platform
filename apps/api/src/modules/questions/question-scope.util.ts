import { prisma, withTenant } from '@atlas/db';
import type { ClassLevel } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';

/** Every route in this module is `@Authorized`-gated via `AuthGuard` (never
 * `PlatformAuthGuard`), so `actor.kind` is always `'SCHOOL'` in practice —
 * this narrows the type for TypeScript and fails loudly (rather than a
 * confusing downstream `undefined`) in the unreachable-in-practice case a
 * future change ever routed a platform actor here. */
export function requireSchoolActor(
  actor: AuthorizedActor,
): Extract<AuthorizedActor, { kind: 'SCHOOL' }> {
  if (actor.kind !== 'SCHOOL') {
    throw new AppHttpException({
      code: 'FORBIDDEN',
      message: 'This action requires a school-scoped session.',
    });
  }
  return actor;
}

/**
 * ADR-0001 §2's exact join: "the teacher holds an active TeacherAssignment
 * to some ClassSubject whose Subject matches the question and whose
 * ClassGroup.level matches the question's level." Two steps, always used
 * together (DoD items 1/2): a direct query resolves whether a real
 * assignment exists at all (and which `classSubjectId` it is), then that id
 * is fed back through the real authorization engine
 * (`AuthorizationService.evaluate`) so the decision is made by the one
 * place this codebase's audit trail/consistency already expects, not a
 * second, parallel notion of "allowed." `PermissionGuard` itself never
 * constructs a `ResourceContext` (see `assigned-scope.resolver.ts`'s own
 * doc comment) — this is the first real caller that does, exactly the
 * extension point B6 left waiting.
 */
export async function requireTeacherAssignedScope(
  authz: AuthorizationService,
  actor: AuthorizedActor,
  permissionId: string,
  params: { schoolId: string; teacherProfileId: string; subjectId: string; level: ClassLevel },
): Promise<{ classSubjectId: string }> {
  const { schoolId, teacherProfileId, subjectId, level } = params;
  const assignment = await withTenant(prisma, schoolId, (tx) =>
    tx.teacherAssignment.findFirst({
      where: {
        schoolId,
        teacherProfileId,
        status: 'ACTIVE',
        classSubject: { subjectId, classGroupSession: { level } },
      },
      select: { classSubjectId: true },
    }),
  );
  if (!assignment) {
    throw new AppHttpException({
      code: 'QUESTION_OUT_OF_SCOPE',
      message:
        'You have no active assignment covering this subject and level — questions may only be ' +
        'authored within your assigned scope.',
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

/** `Question.authorTeacherProfileId`/`QuestionRevision.createdByMembershipId`
 * both require the actor to hold a real `TeacherProfile` — only Teachers
 * author questions (`questionBank.create`'s grant: TEACHER ASSIGNED only,
 * everyone else denied). Reused by the bulk-import path too, where the
 * uploader may hold a wider grant (Moderator/HOD/School Admin) than the
 * question-authoring rule itself allows — see
 * `QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE`'s own error-code comment. */
export async function requireTeacherProfile(
  schoolId: string,
  membershipId: string,
): Promise<{ id: string }> {
  const profile = await withTenant(prisma, schoolId, (tx) =>
    tx.teacherProfile.findUnique({
      where: { schoolId_membershipId: { schoolId, membershipId } },
      select: { id: true },
    }),
  );
  if (!profile) {
    throw new AppHttpException({
      code: 'QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE',
      message: 'Only an actor with an active teacher profile at this school can author questions.',
    });
  }
  return profile;
}
