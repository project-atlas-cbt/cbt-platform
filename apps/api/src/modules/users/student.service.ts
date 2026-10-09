import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { runUniqueGuarded } from '../academics/prisma-error.util.js';
import { AuditService } from '../operations/audit-event.service.js';
import { AuthLockoutService } from '../identity/auth-lockout.service.js';
import { CredentialSheetService } from '../identity/credential-sheet.service.js';
import { CredentialResetResponseDto } from './dto/credential-reset.dto.js';
import type {
  CreateStudentDto,
  ListStudentsQueryDto,
  StudentListResponseDto,
  StudentOwnProfileResponseDto,
  StudentResponseDto,
  UpdateStudentDto,
} from './dto/student.dto.js';
import { createPersonMembership, notFound, searchWords } from './person.util.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

type StudentRow = {
  id: string;
  studentId: string;
  admissionNumber: string | null;
  status: string;
  membership: {
    id: string;
    userId: string;
    loginIdentifier: string;
    user: { firstName: string; lastName: string; displayName: string; status: string };
  };
};

type CurrentEnrollment = {
  studentProfileId: string;
  currentClassId: string | null;
  currentClassName: string | null;
  currentAcademicSessionId: string | null;
  streamId: string | null;
  streamName: string | null;
};

function toResponseDto(row: StudentRow, enrollment?: CurrentEnrollment): StudentResponseDto {
  return {
    membershipId: row.membership.id,
    userId: row.membership.userId,
    studentProfileId: row.id,
    firstName: row.membership.user.firstName,
    lastName: row.membership.user.lastName,
    displayName: row.membership.user.displayName,
    studentId: row.studentId,
    admissionNumber: row.admissionNumber,
    loginIdentifier: row.membership.loginIdentifier,
    userStatus: row.membership.user.status as StudentResponseDto['userStatus'],
    profileStatus: row.status as StudentResponseDto['profileStatus'],
    currentClassId: enrollment?.currentClassId ?? null,
    currentClassName: enrollment?.currentClassName ?? null,
    currentAcademicSessionId: enrollment?.currentAcademicSessionId ?? null,
    streamId: enrollment?.streamId ?? null,
    streamName: enrollment?.streamName ?? null,
  };
}

const INCLUDE = { membership: { include: { user: true } } } as const;

/** F7 gap-closure (decision A) — resolves each given student's current
 * (ACTIVE) enrollment in one batched query, mirroring
 * `SchoolsAdminService.list()`'s own per-page enrichment pattern
 * (`studentCount`/subscription via a second query keyed off the page's own
 * ids, not N+1 per-row queries). `classGroupSession` is `StudentEnrollment`'s
 * actual relation field name to `ClassGroup` (not `classGroup`) — see the
 * schema's own D-10-style composite-FK comment on that field. */
export async function resolveCurrentEnrollments(
  tx: Prisma.TransactionClient,
  schoolId: string,
  studentProfileIds: string[],
): Promise<Map<string, CurrentEnrollment>> {
  if (studentProfileIds.length === 0) return new Map();
  const enrollments = await tx.studentEnrollment.findMany({
    where: { schoolId, studentProfileId: { in: studentProfileIds }, status: 'ACTIVE' },
    include: {
      classGroupSession: true,
      stream: { select: { id: true, name: true } },
    },
  });
  const map = new Map<string, CurrentEnrollment>();
  for (const enrollment of enrollments) {
    map.set(enrollment.studentProfileId, {
      studentProfileId: enrollment.studentProfileId,
      currentClassId: enrollment.classGroupSession.id,
      currentClassName: enrollment.classGroupSession.name,
      currentAcademicSessionId: enrollment.academicSessionId,
      streamId: enrollment.stream?.id ?? null,
      streamName: enrollment.stream?.name ?? null,
    });
  }
  return map;
}

/** `people.v1` — Student directory & lifecycle (05 §9). Deactivate/
 * reactivate toggle `User.status` only — `StudentProfile`/
 * `StudentEnrollment` and anything a student ever answered stay untouched
 * (DoD item 6's symmetric case). */
@Injectable()
export class StudentService {
  constructor(
    private readonly audit: AuditService,
    private readonly credentialSheets: CredentialSheetService,
    private readonly lockout: AuthLockoutService,
  ) {}

  /** F7 gap-closure: server-side search/sort/paginate (DoD item 1), plus
   * decision A's Class/Department/Session enrichment and `classId` filter.
   * `withTenant`'s callback already runs inside one open transaction
   * (`Prisma.TransactionClient` has no `$transaction` of its own — nested
   * `tx.$transaction([...])`, the school-list precedent's own shape, isn't
   * available here), so `findMany`/`count` run as two plain awaited calls
   * on the same `tx` instead. */
  async list(schoolId: string, query: ListStudentsQueryDto = {}): Promise<StudentListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDir = query.sortDir ?? 'asc';
    const sortBy = query.sortBy ?? 'studentId';
    const words = searchWords(query.q);

    const where: Prisma.StudentProfileWhereInput = {
      schoolId,
      ...(words.length > 0 && {
        AND: words.map((word) => ({
          OR: [
            { studentId: { contains: word, mode: 'insensitive' } },
            { membership: { user: { firstName: { contains: word, mode: 'insensitive' } } } },
            { membership: { user: { lastName: { contains: word, mode: 'insensitive' } } } },
          ],
        })),
      }),
      ...(query.classId && {
        enrollments: { some: { classId: query.classId, status: 'ACTIVE' } },
      }),
    };
    const orderBy: Prisma.StudentProfileOrderByWithRelationInput =
      sortBy === 'lastName'
        ? { membership: { user: { lastName: sortDir } } }
        : { studentId: sortDir };

    const { rows, total } = await withTenant(prisma, schoolId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.studentProfile.findMany({
          where,
          include: INCLUDE,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.studentProfile.count({ where }),
      ]);
      const enrollmentMap = await resolveCurrentEnrollments(
        tx,
        schoolId,
        rows.map((row) => row.id),
      );
      return { rows: rows.map((row) => toResponseDto(row, enrollmentMap.get(row.id))), total };
    });

    return { students: rows, total, page, pageSize };
  }

  async get(schoolId: string, studentProfileId: string): Promise<StudentResponseDto> {
    const result = await withTenant(prisma, schoolId, async (tx) => {
      const row = await tx.studentProfile.findUnique({
        where: { id: studentProfileId },
        include: INCLUDE,
      });
      if (!row) return null;
      const enrollmentMap = await resolveCurrentEnrollments(tx, schoolId, [row.id]);
      return toResponseDto(row, enrollmentMap.get(row.id));
    });
    if (!result) return notFound('Student');
    return result;
  }

  /** F14 gap-closure — `GET /students/me` (04 §62's Profile screen). Resolves
   * the *caller's own* row from their `membershipId` — the same lookup shape
   * `student-result.service.ts`'s `requireOwnStudentProfile` uses — never a
   * caller-supplied id, so there is no "someone else's profile" case to
   * consider. Deliberately minimal (`StudentOwnProfileResponseDto`, not the
   * full staff `StudentResponseDto`) — no account/profile status, no ids
   * beyond what the screen needs. */
  async getOwnProfile(
    schoolId: string,
    membershipId: string,
  ): Promise<StudentOwnProfileResponseDto> {
    const result = await withTenant(prisma, schoolId, async (tx) => {
      const row = await tx.studentProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId } },
        include: INCLUDE,
      });
      if (!row) return null;
      const enrollmentMap = await resolveCurrentEnrollments(tx, schoolId, [row.id]);
      const enrollment = enrollmentMap.get(row.id);
      return {
        displayName: row.membership.user.displayName,
        studentId: row.studentId,
        currentClassName: enrollment?.currentClassName ?? null,
        streamName: enrollment?.streamName ?? null,
      };
    });
    // Unreachable via the STUDENT-only route this backs (a membership with
    // an active STUDENT role always has a StudentProfile) — defensive, not
    // a real case, matching `get()`'s own precedent for a missing row.
    if (!result) return notFound('Student profile');
    return result;
  }

  async create(
    schoolId: string,
    dto: CreateStudentDto,
    actor: ActorContext,
  ): Promise<StudentResponseDto> {
    const created = await withTenant(prisma, schoolId, async (tx) => {
      const person = await createPersonMembership(tx, {
        schoolId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        loginIdentifier: dto.studentId,
        role: 'STUDENT',
      });
      const profile = await runUniqueGuarded(
        () =>
          tx.studentProfile.create({
            data: {
              schoolId,
              membershipId: person.membershipId,
              studentId: dto.studentId,
              ...(dto.admissionNumber !== undefined && { admissionNumber: dto.admissionNumber }),
              ...(dto.admissionDate !== undefined && {
                admissionDate: new Date(dto.admissionDate),
              }),
            },
          }),
        `A student with ID "${dto.studentId}" already exists at this school.`,
      );
      return tx.studentProfile.findUniqueOrThrow({ where: { id: profile.id }, include: INCLUDE });
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'STUDENT_CREATED',
      entityType: 'StudentProfile',
      entityId: created.id,
    });
    return toResponseDto(created);
  }

  async update(
    schoolId: string,
    studentProfileId: string,
    dto: UpdateStudentDto,
    actor: ActorContext,
  ): Promise<StudentResponseDto> {
    const updated = await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.studentProfile.findUnique({
        where: { id: studentProfileId },
        include: INCLUDE,
      });
      if (!existing) return notFound('Student');

      if (dto.firstName !== undefined || dto.lastName !== undefined) {
        const firstName = dto.firstName ?? existing.membership.user.firstName;
        const lastName = dto.lastName ?? existing.membership.user.lastName;
        await tx.user.update({
          where: { id: existing.membership.userId },
          data: { firstName, lastName, displayName: `${firstName} ${lastName}` },
        });
      }
      if (dto.admissionNumber !== undefined) {
        await tx.studentProfile.update({
          where: { id: studentProfileId },
          data: { admissionNumber: dto.admissionNumber },
        });
      }
      const row = await tx.studentProfile.findUniqueOrThrow({
        where: { id: studentProfileId },
        include: INCLUDE,
      });
      const enrollmentMap = await resolveCurrentEnrollments(tx, schoolId, [row.id]);
      return toResponseDto(row, enrollmentMap.get(row.id));
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'STUDENT_UPDATED',
      entityType: 'StudentProfile',
      entityId: studentProfileId,
    });
    return updated;
  }

  private async setUserStatus(
    schoolId: string,
    studentProfileId: string,
    status: 'ACTIVE' | 'INACTIVE',
    action: string,
    actor: ActorContext,
  ): Promise<StudentResponseDto> {
    const updated = await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.studentProfile.findUnique({
        where: { id: studentProfileId },
        include: INCLUDE,
      });
      if (!existing) return notFound('Student');
      await tx.user.update({ where: { id: existing.membership.userId }, data: { status } });
      const row = await tx.studentProfile.findUniqueOrThrow({
        where: { id: studentProfileId },
        include: INCLUDE,
      });
      const enrollmentMap = await resolveCurrentEnrollments(tx, schoolId, [row.id]);
      return toResponseDto(row, enrollmentMap.get(row.id));
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action,
      entityType: 'StudentProfile',
      entityId: studentProfileId,
    });
    return updated;
  }

  async deactivate(
    schoolId: string,
    studentProfileId: string,
    actor: ActorContext,
  ): Promise<StudentResponseDto> {
    return this.setUserStatus(schoolId, studentProfileId, 'INACTIVE', 'STUDENT_DEACTIVATED', actor);
  }

  async reactivate(
    schoolId: string,
    studentProfileId: string,
    actor: ActorContext,
  ): Promise<StudentResponseDto> {
    return this.setUserStatus(schoolId, studentProfileId, 'ACTIVE', 'STUDENT_REACTIVATED', actor);
  }

  /** Calls `CredentialSheetService.issueInitialPasswords` directly rather
   * than reimplementing password issuance, per that service's own doc
   * comment naming B6 as the phase that finally calls it. A single-element
   * array in, the one resulting row back out as this response's payload —
   * the plaintext is never stored and never retrievable again. */
  async resetCredentials(
    schoolId: string,
    studentProfileId: string,
    actor: ActorContext,
  ): Promise<CredentialResetResponseDto> {
    const profile = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findUnique({ where: { id: studentProfileId }, include: INCLUDE }),
    );
    if (!profile) return notFound('Student');

    const [row] = await this.credentialSheets.issueInitialPasswords(schoolId, [
      profile.membership.id,
    ]);
    if (!row) {
      throw new AppHttpException({
        code: 'CREDENTIAL_RESET_FAILED',
        message: 'Could not issue new credentials for this student.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'STUDENT_CREDENTIALS_RESET',
      entityType: 'StudentProfile',
      entityId: studentProfileId,
    });
    return {
      membershipId: profile.membership.id,
      loginIdentifier: row.loginIdentifier,
      initialPassword: row.initialPassword,
    };
  }

  /** Students whose sign-in is locked right now, so staff can unlock them
   * from one list instead of finding each name (pilot follow-up
   * 2026-10-08). Lockout counters are keyed by Login ID in Redis; they are
   * matched to students case-insensitively, as sign-in does. */
  async listLockedOut(schoolId: string): Promise<StudentResponseDto[]> {
    const identifiers = await this.lockout.lockedIdentifiers(schoolId);
    if (identifiers.length === 0) return [];
    return withTenant(prisma, schoolId, async (tx) => {
      const rows = await tx.studentProfile.findMany({
        where: {
          schoolId,
          membership: {
            OR: identifiers.map((id) => ({
              loginIdentifier: { equals: id, mode: 'insensitive' as const },
            })),
          },
        },
        include: INCLUDE,
        orderBy: { membership: { user: { lastName: 'asc' } } },
      });
      const enrollmentMap = await resolveCurrentEnrollments(
        tx,
        schoolId,
        rows.map((row) => row.id),
      );
      return rows.map((row) => toResponseDto(row, enrollmentMap.get(row.id)));
    });
  }

  /** P1-4: ends a sign-in lockout without changing the student's password.
   * Five wrong guesses at a guessable student ID lock the account; staff
   * clear it here so the student signs straight back in (mid-exam, their
   * attempt timer is still running). */
  async unlockSignIn(
    schoolId: string,
    studentProfileId: string,
    actor: ActorContext,
  ): Promise<void> {
    const profile = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findUnique({ where: { id: studentProfileId }, include: INCLUDE }),
    );
    if (!profile) return notFound('Student');

    await this.lockout.clear(schoolId, profile.membership.loginIdentifier);
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'STUDENT_SIGN_IN_UNLOCKED',
      entityType: 'StudentProfile',
      entityId: studentProfileId,
    });
  }
}
