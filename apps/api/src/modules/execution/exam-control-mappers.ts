import { prisma, withTenant, type Prisma } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import type {
  ExamAdministratorResponseDto,
  ExamSessionParticipantResponseDto,
  ExamSessionResponseDto,
} from './dto/exam-session.dto.js';

/** The exam fields every session/participant/administrator permission check
 * in this module needs to build a `ResourceContext` from — mirrors
 * `exams/exam.service.ts`'s own `ownerMembershipId`/`departmentId` pattern,
 * plus the new `examId` field `ResourceContext` gained for B12's
 * ExamAdministrator-aware `OWNED` resolver. */
export const EXAM_CONTROL_PARENT_EXAM_SELECT = {
  id: true,
  schoolId: true,
  title: true,
  status: true,
  accessMode: true,
  academicSessionId: true,
  createdByMembershipId: true,
  departmentId: true,
} satisfies Prisma.ExamSelect;

export type ExamControlParentExam = Prisma.ExamGetPayload<{
  select: typeof EXAM_CONTROL_PARENT_EXAM_SELECT;
}>;

export const EXAM_SESSION_WITH_EXAM_INCLUDE = {
  exam: { select: EXAM_CONTROL_PARENT_EXAM_SELECT },
} satisfies Prisma.ExamSessionInclude;

export type ExamSessionWithExam = Prisma.ExamSessionGetPayload<{
  include: typeof EXAM_SESSION_WITH_EXAM_INCLUDE;
}>;

export const EXAM_SESSION_PARTICIPANT_INCLUDE = {
  studentProfile: {
    select: {
      id: true,
      studentId: true,
      membership: { select: { user: { select: { displayName: true } } } },
    },
  },
} satisfies Prisma.ExamSessionParticipantInclude;

export type ExamSessionParticipantWithStudent = Prisma.ExamSessionParticipantGetPayload<{
  include: typeof EXAM_SESSION_PARTICIPANT_INCLUDE;
}>;

export const EXAM_ADMINISTRATOR_INCLUDE = {
  member: { select: { user: { select: { displayName: true } } } },
} satisfies Prisma.ExamAdministratorInclude;

export type ExamAdministratorWithMember = Prisma.ExamAdministratorGetPayload<{
  include: typeof EXAM_ADMINISTRATOR_INCLUDE;
}>;

/** `loadExamOrThrow`'s equivalent for this module — the parent exam is
 * loaded via the same narrow select every permission check needs, never
 * the full `exams/exam-mappers.ts` `EXAM_DETAIL_INCLUDE` shape (this
 * module only ever needs a handful of scalar fields off the parent, not
 * its sections/questions). */
export async function loadParentExamOrThrow(
  schoolId: string,
  examId: string,
): Promise<ExamControlParentExam> {
  const exam = await withTenant(prisma, schoolId, (tx) =>
    tx.exam.findUnique({ where: { id: examId }, select: EXAM_CONTROL_PARENT_EXAM_SELECT }),
  );
  if (!exam || exam.schoolId !== schoolId) {
    throw new AppHttpException({ code: 'NOT_FOUND', message: 'Exam not found.' });
  }
  return exam;
}

export async function loadExamSessionOrThrow(
  schoolId: string,
  examSessionId: string,
): Promise<ExamSessionWithExam> {
  const session = await withTenant(prisma, schoolId, (tx) =>
    tx.examSession.findUnique({
      where: { id: examSessionId },
      include: EXAM_SESSION_WITH_EXAM_INCLUDE,
    }),
  );
  if (!session || session.schoolId !== schoolId) {
    throw new AppHttpException({ code: 'NOT_FOUND', message: 'Exam session not found.' });
  }
  return session;
}

/** F12 gap closure: `openedByMembershipId`/`closedByMembershipId` are bare
 * UUIDs with no Prisma relation (mirrors `Exam.cancelledByMembershipId`'s own
 * B11 precedent) — resolved to a display name via one batched
 * `SchoolMembership` lookup rather than a relation/schema change, and rather
 * than one query per session (which every call site here would otherwise
 * need in a loop). Callers pass every distinct membership id they need
 * resolved; a name missing from the result (a membership deleted since —
 * structurally near-impossible, `SchoolMembership` is never hard-deleted,
 * but not provably impossible) falls back to a labelled placeholder rather
 * than throwing. */
export async function resolveMembershipDisplayNames(
  schoolId: string,
  membershipIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(membershipIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.findMany({
      where: { schoolId, id: { in: ids } },
      select: { id: true, user: { select: { displayName: true } } },
    }),
  );
  return new Map(rows.map((row) => [row.id, row.user.displayName]));
}

export function toExamSessionResponseDto(
  session: {
    id: string;
    examId: string;
    sessionType: string;
    status: string;
    openedAt: Date;
    openedByMembershipId: string;
    closedAt: Date | null;
    closedByMembershipId: string | null;
    reopenedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  names: Map<string, string>,
): ExamSessionResponseDto {
  return {
    id: session.id,
    examId: session.examId,
    sessionType: session.sessionType as ExamSessionResponseDto['sessionType'],
    status: session.status as ExamSessionResponseDto['status'],
    openedAt: session.openedAt.toISOString(),
    openedByMembershipId: session.openedByMembershipId,
    openedByName: names.get(session.openedByMembershipId) ?? 'Unknown',
    closedAt: session.closedAt?.toISOString() ?? null,
    closedByMembershipId: session.closedByMembershipId,
    closedByName: session.closedByMembershipId
      ? (names.get(session.closedByMembershipId) ?? 'Unknown')
      : null,
    reopenedAt: session.reopenedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export function toExamSessionParticipantResponseDto(
  participant: ExamSessionParticipantWithStudent,
): ExamSessionParticipantResponseDto {
  return {
    id: participant.id,
    examSessionId: participant.examSessionId,
    studentProfileId: participant.studentProfileId,
    studentIdNumber: participant.studentProfile.studentId,
    studentName: participant.studentProfile.membership.user.displayName,
    status: participant.status,
    authorizedAt: participant.authorizedAt.toISOString(),
    authorizedByMembershipId: participant.authorizedByMembershipId,
    revokedAt: participant.revokedAt?.toISOString() ?? null,
    revokedByMembershipId: participant.revokedByMembershipId,
    revokedReason: participant.revokedReason,
  };
}

export function toExamAdministratorResponseDto(
  admin: ExamAdministratorWithMember,
): ExamAdministratorResponseDto {
  return {
    id: admin.id,
    examId: admin.examId,
    membershipId: admin.membershipId,
    memberName: admin.member.user.displayName,
    status: admin.status,
    assignedAt: admin.assignedAt.toISOString(),
    assignedByMembershipId: admin.assignedByMembershipId,
    revokedAt: admin.revokedAt?.toISOString() ?? null,
  };
}
