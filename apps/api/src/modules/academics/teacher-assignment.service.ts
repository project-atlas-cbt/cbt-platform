import { forbiddenOtherRecord } from './actor.util.js';
import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type {
  ClassTeacherEntryDto,
  MyTeacherAssignmentEntryDto,
  ReplaceTeacherAssignmentsDto,
  TeacherAssignmentResponseDto,
} from './dto/teacher-assignment.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function toResponseDto(assignment: {
  id: string;
  teacherProfileId: string;
  classSubjectId: string;
  academicSessionId: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
}): TeacherAssignmentResponseDto {
  return {
    id: assignment.id,
    teacherProfileId: assignment.teacherProfileId,
    classSubjectId: assignment.classSubjectId,
    academicSessionId: assignment.academicSessionId,
    startDate: assignment.startDate.toISOString().slice(0, 10),
    endDate: assignment.endDate ? assignment.endDate.toISOString().slice(0, 10) : null,
    status: assignment.status as TeacherAssignmentResponseDto['status'],
  };
}

/** `people.v1` — TeacherAssignment (07 §6.8), "the core authorization
 * entity." The real ASSIGNED scope resolver (assigned-scope.resolver.ts)
 * reads this table directly. */
@Injectable()
export class TeacherAssignmentService {
  constructor(private readonly audit: AuditService) {}

  /** `ownMembershipId`: set for an actor whose only `assignments.view`
   * grant is SELF (a Teacher or Student), who may read only their own
   * record (bug audit P2-9). */
  async listForTeacher(
    schoolId: string,
    teacherProfileId: string,
    ownMembershipId?: string,
  ): Promise<TeacherAssignmentResponseDto[]> {
    if (ownMembershipId !== undefined) {
      const profile = await withTenant(prisma, schoolId, (tx) =>
        tx.teacherProfile.findUnique({
          where: { id: teacherProfileId },
          select: { membershipId: true },
        }),
      );
      if (profile?.membershipId !== ownMembershipId) throw forbiddenOtherRecord();
    }
    const assignments = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.findMany({
        where: { schoolId, teacherProfileId, status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
      }),
    );
    return assignments.map(toResponseDto);
  }

  /**
   * Full-replace: the teacher's whole subject×class set for a session,
   * submitted as one list (05 §12.1's checkbox editor) — diffed against the
   * teacher's current ACTIVE assignments for that session in one
   * transaction. DoD item 5: removed pairs are ENDED (status + endDate),
   * never deleted — future access is revoked, historical authorship stays
   * intact. Re-adding a previously-ended pair (rehire) succeeds cleanly
   * since the partial unique index only constrains ACTIVE rows.
   */
  async replaceForTeacher(
    schoolId: string,
    teacherProfileId: string,
    dto: ReplaceTeacherAssignmentsDto,
    actor: ActorContext,
  ): Promise<TeacherAssignmentResponseDto[]> {
    const result = await withTenant(prisma, schoolId, async (tx) => {
      const teacherProfile = await tx.teacherProfile.findUnique({
        where: { id: teacherProfileId },
      });
      if (!teacherProfile) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Teacher not found.' });
      }
      const activeTeacherRole = await tx.roleAssignment.findFirst({
        where: {
          schoolId,
          membershipId: teacherProfile.membershipId,
          role: 'TEACHER',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!activeTeacherRole) {
        throw new AppHttpException({
          code: 'TEACHER_ASSIGNMENT_REQUIRES_ACTIVE_ROLE',
          message: 'The referenced membership does not hold an active TEACHER role assignment.',
        });
      }

      const desired = new Set(dto.classSubjectIds);
      const current = await tx.teacherAssignment.findMany({
        where: {
          schoolId,
          teacherProfileId,
          academicSessionId: dto.academicSessionId,
          status: 'ACTIVE',
        },
      });
      const currentByClassSubjectId = new Map(current.map((a) => [a.classSubjectId, a]));

      const toEnd = current.filter((a) => !desired.has(a.classSubjectId));
      const toCreate = [...desired].filter((id) => !currentByClassSubjectId.has(id));

      if (toEnd.length > 0) {
        await tx.teacherAssignment.updateMany({
          where: { schoolId, id: { in: toEnd.map((a) => a.id) } },
          data: { status: 'ENDED', endDate: new Date() },
        });
      }
      for (const classSubjectId of toCreate) {
        const classSubject = await tx.classSubject.findUnique({ where: { id: classSubjectId } });
        if (!classSubject) {
          throw new AppHttpException({
            code: 'NOT_FOUND',
            message: `Class-subject offering ${classSubjectId} not found.`,
          });
        }
        // Defense-in-depth: a classSubjectId belonging to a different
        // session than `dto.academicSessionId` must never be allowed to
        // create a TeacherAssignment row here — that row's own
        // `academicSessionId` would then disagree with the session its
        // `classSubjectId` actually belongs to. The frontend matrix already
        // filters its selection by session, but this endpoint accepts a
        // caller-supplied `classSubjectIds` array directly and must not rely
        // on the client alone to keep that invariant.
        if (classSubject.academicSessionId !== dto.academicSessionId) {
          throw new AppHttpException({
            code: 'ACADEMIC_STRUCTURE_SESSION_MISMATCH',
            message: `Class-subject offering ${classSubjectId} does not belong to the given academic session.`,
          });
        }
        await runUniqueGuarded(
          () =>
            tx.teacherAssignment.create({
              data: {
                schoolId,
                teacherProfileId,
                classSubjectId,
                academicSessionId: dto.academicSessionId,
                startDate: new Date(),
              },
            }),
          'This teacher already has an active assignment for this class-subject.',
        );
      }

      return { added: toCreate.length, removed: toEnd.length };
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'TEACHER_ASSIGNMENTS_REPLACED',
      entityType: 'TeacherProfile',
      entityId: teacherProfileId,
      metadata: { academicSessionId: dto.academicSessionId, ...result },
    });

    return this.listForTeacher(schoolId, teacherProfileId);
  }

  /** `GET /v1/teachers/me/assignments` — F11 gap-closure (2026-09-03): the
   * caller's own active class×subject assignments, self-resolved from the
   * session — closes the exam builder's class/subject-picker data-source
   * gap (`schoolConfig.class.view`/`.subject.view` are both denied to
   * TEACHER, so no other endpoint can supply this). Returns an empty list,
   * not an error, when the caller has no `TeacherProfile` yet — the caller
   * (a picker component) renders its own empty state rather than a raw
   * failure. */
  async listForCurrentTeacher(
    schoolId: string,
    membershipId: string,
  ): Promise<MyTeacherAssignmentEntryDto[]> {
    return withTenant(prisma, schoolId, async (tx) => {
      const profile = await tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId } },
      });
      if (!profile) {
        return [];
      }
      const assignments = await tx.teacherAssignment.findMany({
        where: { schoolId, teacherProfileId: profile.id, status: 'ACTIVE' },
        include: {
          classSubject: { include: { classGroupSession: true, subject: true } },
        },
        orderBy: [{ classSubject: { subject: { name: 'asc' } } }],
      });
      return assignments.map((assignment) => ({
        classSubjectId: assignment.classSubjectId,
        academicSessionId: assignment.academicSessionId,
        classId: assignment.classSubject.classId,
        className: assignment.classSubject.classGroupSession.name,
        level: assignment.classSubject.classGroupSession.level,
        arm: assignment.classSubject.classGroupSession.arm,
        subjectId: assignment.classSubject.subjectId,
        subjectName: assignment.classSubject.subject.name,
      }));
    });
  }

  /** `GET /v1/classes/:id/teachers` — F6 gap-closure (2026-08-28): the class
   * roster's teacher-side counterpart. `TeacherAssignment` is keyed by
   * `classSubjectId`, not `classId` directly, so this filters through the
   * `classSubject` relation rather than requiring a separate lookup of the
   * class's offerings first. Enriched with teacher and subject display
   * fields, mirroring `StudentEnrollmentService.rosterForClass`'s own
   * enrichment precedent — directly displayable, no second call per row. */
  async listForClass(schoolId: string, classId: string): Promise<ClassTeacherEntryDto[]> {
    const assignments = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.findMany({
        where: { schoolId, status: 'ACTIVE', classSubject: { classId } },
        include: {
          teacherProfile: { include: { membership: { include: { user: true } } } },
          classSubject: { include: { subject: true } },
        },
        orderBy: [
          { classSubject: { subject: { name: 'asc' } } },
          { teacherProfile: { staffId: 'asc' } },
        ],
      }),
    );
    return assignments.map((assignment) => ({
      assignmentId: assignment.id,
      teacherProfileId: assignment.teacherProfileId,
      staffId: assignment.teacherProfile.staffId,
      displayName: assignment.teacherProfile.membership.user.displayName,
      subjectId: assignment.classSubject.subjectId,
      subjectName: assignment.classSubject.subject.name,
      subjectCode: assignment.classSubject.subject.code,
      startDate: assignment.startDate.toISOString().slice(0, 10),
    }));
  }
}
