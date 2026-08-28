import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { runUniqueGuarded } from '../academics/prisma-error.util.js';
import { AuditService } from '../operations/audit-event.service.js';
import { CredentialSheetService } from '../identity/credential-sheet.service.js';
import { CredentialResetResponseDto } from './dto/credential-reset.dto.js';
import type { CreateStudentDto, StudentResponseDto, UpdateStudentDto } from './dto/student.dto.js';
import { createPersonMembership, notFound } from './person.util.js';

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

function toResponseDto(row: StudentRow): StudentResponseDto {
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
  };
}

const INCLUDE = { membership: { include: { user: true } } } as const;

/** `people.v1` — Student directory & lifecycle (05 §9). Deactivate/
 * reactivate toggle `User.status` only — `StudentProfile`/
 * `StudentEnrollment` and anything a student ever answered stay untouched
 * (DoD item 6's symmetric case). */
@Injectable()
export class StudentService {
  constructor(
    private readonly audit: AuditService,
    private readonly credentialSheets: CredentialSheetService,
  ) {}

  async list(schoolId: string): Promise<StudentResponseDto[]> {
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findMany({
        where: { schoolId },
        include: INCLUDE,
        orderBy: { studentId: 'asc' },
      }),
    );
    return rows.map(toResponseDto);
  }

  async get(schoolId: string, studentProfileId: string): Promise<StudentResponseDto> {
    const row = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findUnique({ where: { id: studentProfileId }, include: INCLUDE }),
    );
    if (!row) return notFound('Student');
    return toResponseDto(row);
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
      return tx.studentProfile.findUniqueOrThrow({
        where: { id: studentProfileId },
        include: INCLUDE,
      });
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'STUDENT_UPDATED',
      entityType: 'StudentProfile',
      entityId: studentProfileId,
    });
    return toResponseDto(updated);
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
      return tx.studentProfile.findUniqueOrThrow({
        where: { id: studentProfileId },
        include: INCLUDE,
      });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action,
      entityType: 'StudentProfile',
      entityId: studentProfileId,
    });
    return toResponseDto(updated);
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
}
