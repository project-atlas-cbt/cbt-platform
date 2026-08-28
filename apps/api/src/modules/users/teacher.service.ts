import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { runUniqueGuarded } from '../academics/prisma-error.util.js';
import { AuditService } from '../operations/audit-event.service.js';
import { IdentityService } from '../identity/identity.service.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import type { CreateTeacherDto, TeacherResponseDto, UpdateTeacherDto } from './dto/teacher.dto.js';
import { createPersonMembership, notFound } from './person.util.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

type TeacherRow = {
  id: string;
  staffId: string;
  employmentStatus: string;
  membership: {
    id: string;
    userId: string;
    loginIdentifier: string;
    user: {
      firstName: string;
      lastName: string;
      displayName: string;
      email: string | null;
      status: string;
    };
    roleAssignments: { role: string; status: string }[];
  };
};

function toResponseDto(row: TeacherRow): TeacherResponseDto {
  return {
    membershipId: row.membership.id,
    userId: row.membership.userId,
    teacherProfileId: row.id,
    firstName: row.membership.user.firstName,
    lastName: row.membership.user.lastName,
    displayName: row.membership.user.displayName,
    email: row.membership.user.email,
    staffId: row.staffId,
    loginIdentifier: row.membership.loginIdentifier,
    userStatus: row.membership.user.status as TeacherResponseDto['userStatus'],
    employmentStatus: row.employmentStatus as TeacherResponseDto['employmentStatus'],
    isHod: row.membership.roleAssignments.some((r) => r.role === 'HOD' && r.status === 'ACTIVE'),
  };
}

const INCLUDE = {
  membership: { include: { user: true, roleAssignments: true } },
} as const;

/** `people.v1` — Teacher directory & lifecycle (05 §11). Deactivate/
 * reactivate toggle `User.status` only — `TeacherProfile`/
 * `TeacherAssignment` and anything the teacher ever authored (questions,
 * exams) stay untouched, still attributed to them (DoD item 6). */
@Injectable()
export class TeacherService {
  constructor(
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
  ) {}

  async list(schoolId: string): Promise<TeacherResponseDto[]> {
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findMany({
        where: { schoolId },
        include: INCLUDE,
        orderBy: { staffId: 'asc' },
      }),
    );
    return rows.map(toResponseDto);
  }

  async get(schoolId: string, teacherProfileId: string): Promise<TeacherResponseDto> {
    const row = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({ where: { id: teacherProfileId }, include: INCLUDE }),
    );
    if (!row) return notFound('Teacher');
    return toResponseDto(row);
  }

  async create(
    schoolId: string,
    dto: CreateTeacherDto,
    actor: ActorContext,
  ): Promise<TeacherResponseDto> {
    const created = await withTenant(prisma, schoolId, async (tx) => {
      const person = await createPersonMembership(tx, {
        schoolId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        loginIdentifier: dto.staffId,
        role: 'TEACHER',
      });
      const profile = await runUniqueGuarded(
        () =>
          tx.teacherProfile.create({
            data: { schoolId, membershipId: person.membershipId, staffId: dto.staffId },
          }),
        `A teacher with staff ID "${dto.staffId}" already exists at this school.`,
      );
      return { profileId: profile.id, userId: person.userId };
    });

    // Staff invitation dispatch — synchronous, at creation time (not a
    // batch/queued job; per-person, per templates.ts's own doc comment
    // anticipating exactly this reuse). A dispatch failure here must not
    // silently orphan an un-invitable teacher record — surfaced as a real
    // error, not swallowed.
    await this.identity.issueStaffInvitation(schoolId, created.userId);

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'TEACHER_CREATED',
      entityType: 'TeacherProfile',
      entityId: created.profileId,
    });
    return this.get(schoolId, created.profileId);
  }

  async update(
    schoolId: string,
    teacherProfileId: string,
    dto: UpdateTeacherDto,
    actor: ActorContext,
  ): Promise<TeacherResponseDto> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.teacherProfile.findUnique({
        where: { id: teacherProfileId },
        include: INCLUDE,
      });
      if (!existing) return notFound('Teacher');

      if (dto.firstName !== undefined || dto.lastName !== undefined || dto.email !== undefined) {
        const firstName = dto.firstName ?? existing.membership.user.firstName;
        const lastName = dto.lastName ?? existing.membership.user.lastName;
        await tx.user.update({
          where: { id: existing.membership.userId },
          data: {
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`,
            ...(dto.email !== undefined && { email: dto.email }),
          },
        });
      }
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'TEACHER_UPDATED',
      entityType: 'TeacherProfile',
      entityId: teacherProfileId,
    });
    return this.get(schoolId, teacherProfileId);
  }

  private async setUserStatus(
    schoolId: string,
    teacherProfileId: string,
    status: 'ACTIVE' | 'INACTIVE',
    action: string,
    actor: ActorContext,
  ): Promise<TeacherResponseDto> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.teacherProfile.findUnique({
        where: { id: teacherProfileId },
        include: INCLUDE,
      });
      if (!existing) return notFound('Teacher');
      await tx.user.update({ where: { id: existing.membership.userId }, data: { status } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action,
      entityType: 'TeacherProfile',
      entityId: teacherProfileId,
    });
    return this.get(schoolId, teacherProfileId);
  }

  async deactivate(
    schoolId: string,
    teacherProfileId: string,
    actor: ActorContext,
  ): Promise<TeacherResponseDto> {
    return this.setUserStatus(schoolId, teacherProfileId, 'INACTIVE', 'TEACHER_DEACTIVATED', actor);
  }

  async reactivate(
    schoolId: string,
    teacherProfileId: string,
    actor: ActorContext,
  ): Promise<TeacherResponseDto> {
    return this.setUserStatus(schoolId, teacherProfileId, 'ACTIVE', 'TEACHER_REACTIVATED', actor);
  }

  /** Staff reset via a fresh invitation link (CredentialState's own doc
   * comment: "staff: invitation link; student: system-generated password")
   * — reuses `IdentityService.issueStaffInvitation`'s identical token/
   * notification mechanism, not `CredentialSheetService` (the student-only,
   * shown-once-password primitive). The resetter never sees a password at
   * all here, by design — the link goes straight to the teacher's own
   * inbox. */
  async resetCredentials(
    schoolId: string,
    teacherProfileId: string,
    actor: ActorContext,
  ): Promise<StatusResponseDto> {
    const profile = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({ where: { id: teacherProfileId }, include: INCLUDE }),
    );
    if (!profile) return notFound('Teacher');

    await this.identity.issueStaffInvitation(schoolId, profile.membership.userId);

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'TEACHER_CREDENTIALS_RESET',
      entityType: 'TeacherProfile',
      entityId: teacherProfileId,
    });
    return { status: 'ok' };
  }
}
