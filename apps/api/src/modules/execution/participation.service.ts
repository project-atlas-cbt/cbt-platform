import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import {
  classifyAttemptParticipation,
  type AttemptAuthorizationStatus,
  type AttemptAuthorizationType,
  type AttemptParticipationClassification,
  type AttemptState,
  type ParticipationStatus,
  type Role,
} from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { loadExamOrThrow } from '../exams/exam-mappers.js';
import { AuditService } from '../operations/audit-event.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import type {
  BulkGrantMakeupDto,
  ConfirmAbsencesDto,
  GrantAttemptAuthorizationDto,
  InvalidateAttemptDto,
  RevokeAttemptAuthorizationDto,
} from './dto/participation.dto.js';

type ParticipationRow = {
  studentProfileId: string;
  studentName: string;
  studentIdentifier: string;
  classId: string | null;
  className: string | null;
  examSessionId: string;
  sessionType: string;
  sessionStatus: string;
  sessionOpenedAt: Date;
  sessionClosedAt: Date | null;
  sessionCompletedAt: Date | null;
  participationId: string | null;
  participationStatus: ParticipationStatus;
  attemptId: string | null;
  attemptState: AttemptState | null;
  invalidationReason: string | null;
};

type AuthorizationRow = {
  id: string;
  studentProfileId: string;
  type: AttemptAuthorizationType;
  status: AttemptAuthorizationStatus;
  reason: string;
  authorizedAt: Date;
  expiresAt: Date | null;
  sourceExamSessionId: string | null;
  sourceParticipationId: string | null;
  sourceAttemptId: string | null;
  usedByAttemptId: string | null;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
};

const classificationPriority: Record<AttemptParticipationClassification, number> = {
  COMPLETED: 6,
  IN_PROGRESS: 5,
  INCOMPLETE: 4,
  ABSENT: 3,
  INVALIDATED: 2,
  PENDING: 1,
};

function toAuthorizationDto(row: AuthorizationRow) {
  const status: AttemptAuthorizationStatus =
    row.status === 'AUTHORIZED' && row.expiresAt !== null && row.expiresAt <= new Date()
      ? 'EXPIRED'
      : row.status;
  return {
    ...row,
    status,
    authorizedAt: row.authorizedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    usedAt: row.usedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revocable: status === 'AUTHORIZED',
  };
}

@Injectable()
export class ParticipationService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private role(actor: AuthorizedActor): Role {
    return actor.roles[0] ?? 'STUDENT';
  }

  private async allow(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    permission:
      | 'examAdmin.viewRegisteredStudents'
      | 'examAdmin.markAbsence'
      | 'examAdmin.grantMakeup'
      | 'examAdmin.invalidateAttempt',
  ): Promise<void> {
    const exam = await loadExamOrThrow(schoolId, examId);
    const decision = await this.authz.evaluate(actor, permission, {
      schoolId,
      examId,
      ownerMembershipId: exam.createdByMembershipId,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to manage participation for this exam.',
      });
    }
  }

  async list(schoolId: string, actor: AuthorizedActor, examId: string) {
    await this.allow(schoolId, actor, examId, 'examAdmin.viewRegisteredStudents');
    const [rows, authorizationRows] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.$queryRaw<ParticipationRow[]>`
          SELECT participant.student_profile_id AS "studentProfileId",
                 person.display_name AS "studentName",
                 profile.student_id AS "studentIdentifier",
                 class_context.id AS "classId", class_context.name AS "className",
                 session.id AS "examSessionId", session.session_type::text AS "sessionType",
                 session.status::text AS "sessionStatus", session.opened_at AS "sessionOpenedAt",
                 session.closed_at AS "sessionClosedAt", session.completed_at AS "sessionCompletedAt",
                 participation.id AS "participationId",
                 COALESCE(participation.status::text, 'PENDING') AS "participationStatus",
                 attempt.id AS "attemptId", attempt.state::text AS "attemptState",
                 attempt.invalidation_reason AS "invalidationReason"
          FROM exam_session_participants participant
          JOIN exam_sessions session
            ON session.school_id = participant.school_id
           AND session.id = participant.exam_session_id
          JOIN student_profiles profile
            ON profile.school_id = participant.school_id
           AND profile.id = participant.student_profile_id
          JOIN school_memberships membership
            ON membership.school_id = profile.school_id
           AND membership.id = profile.membership_id
          JOIN users person ON person.id = membership.user_id
          LEFT JOIN exam_participations participation
            ON participation.school_id = participant.school_id
           AND participation.exam_id = session.exam_id
           AND participation.exam_session_id = session.id
           AND participation.student_profile_id = participant.student_profile_id
          LEFT JOIN LATERAL (
            SELECT class_group.id, class_group.name
            FROM student_enrollments enrollment
            JOIN class_groups class_group
              ON class_group.school_id = enrollment.school_id
             AND class_group.id = enrollment.class_id
            JOIN class_subjects class_subject
              ON class_subject.school_id = class_group.school_id
             AND class_subject.class_id = class_group.id
            JOIN exam_classes exam_class
              ON exam_class.school_id = class_subject.school_id
             AND exam_class.class_subject_id = class_subject.id
            WHERE enrollment.school_id = participant.school_id
              AND enrollment.student_profile_id = participant.student_profile_id
              AND exam_class.exam_id = session.exam_id
            ORDER BY (enrollment.status = 'ACTIVE') DESC, enrollment.created_at DESC
            LIMIT 1
          ) class_context ON true
          LEFT JOIN LATERAL (
            SELECT current_attempt.id, current_attempt.state,
                   current_attempt.invalidation_reason
            FROM exam_attempts current_attempt
            WHERE current_attempt.school_id = participant.school_id
              AND current_attempt.exam_session_id = session.id
              AND current_attempt.student_profile_id = participant.student_profile_id
            ORDER BY current_attempt.attempt_number DESC
            LIMIT 1
          ) attempt ON true
          WHERE participant.school_id = ${schoolId}::uuid
            AND session.exam_id = ${examId}::uuid
            AND participant.status = 'AUTHORIZED'
          ORDER BY session.opened_at, person.display_name
        `,
        tx.$queryRaw<AuthorizationRow[]>`
          SELECT id, student_profile_id AS "studentProfileId", type, status, reason,
                 authorized_at AS "authorizedAt", expires_at AS "expiresAt",
                 source_exam_session_id AS "sourceExamSessionId",
                 source_participation_id AS "sourceParticipationId",
                 source_attempt_id AS "sourceAttemptId",
                 used_by_attempt_id AS "usedByAttemptId", used_at AS "usedAt",
                 revoked_at AS "revokedAt", revoked_reason AS "revokedReason"
          FROM attempt_authorizations
          WHERE school_id = ${schoolId}::uuid AND exam_id = ${examId}::uuid
          ORDER BY authorized_at DESC
        `,
      ]),
    );

    const authorizations = authorizationRows.map(toAuthorizationDto);
    const items = rows.map((row) => {
      const classification = classifyAttemptParticipation(row);
      return {
        ...row,
        sessionLabel: `${row.sessionType} · ${row.sessionOpenedAt.toISOString()}`,
        sessionOpenedAt: row.sessionOpenedAt.toISOString(),
        sessionClosedAt: row.sessionClosedAt?.toISOString() ?? null,
        sessionCompletedAt: row.sessionCompletedAt?.toISOString() ?? null,
        classification,
        canConfirmAbsence:
          row.sessionStatus !== 'OPEN' &&
          row.attemptId === null &&
          row.participationStatus === 'PENDING',
        authorizations: authorizations.filter(
          (authorization) =>
            authorization.studentProfileId === row.studentProfileId &&
            (authorization.sourceExamSessionId === row.examSessionId ||
              (row.attemptId !== null && authorization.usedByAttemptId === row.attemptId)),
        ),
      };
    });

    const byStudent = new Map<string, typeof items>();
    for (const item of items) {
      byStudent.set(item.studentProfileId, [...(byStudent.get(item.studentProfileId) ?? []), item]);
    }
    const studentRollups = [...byStudent.values()].map((sittings) => {
      const chronological = [...sittings].sort((left, right) =>
        left.sessionOpenedAt.localeCompare(right.sessionOpenedAt),
      );
      const latest = chronological.at(-1)!;
      const best = [...sittings].sort(
        (left, right) =>
          classificationPriority[right.classification] -
          classificationPriority[left.classification],
      )[0]!;
      const studentAuthorizations = authorizations.filter(
        (authorization) => authorization.studentProfileId === best.studentProfileId,
      );
      const actionableAbsence = chronological
        .filter(
          (sitting) =>
            sitting.classification === 'ABSENT' &&
            !studentAuthorizations.some(
              (authorization) =>
                authorization.type === 'MAKEUP' &&
                authorization.sourceParticipationId === sitting.participationId &&
                authorization.status === 'AUTHORIZED',
            ),
        )
        .at(-1);
      return {
        studentProfileId: best.studentProfileId,
        studentName: best.studentName,
        studentIdentifier: best.studentIdentifier,
        classId: best.classId,
        className: best.className,
        classification: best.classification,
        sittingCount: sittings.length,
        examSessionIds: chronological.map((sitting) => sitting.examSessionId),
        originalExamSessionId: chronological[0]?.examSessionId ?? null,
        latestExamSessionId: latest.examSessionId,
        actionableAbsenceParticipationId: actionableAbsence?.participationId ?? null,
        latestAttemptId: latest.attemptId,
        latestInvalidationReason: latest.invalidationReason,
        authorizations: studentAuthorizations,
      };
    });
    const count = (classification: AttemptParticipationClassification) =>
      items.filter((item) => item.classification === classification).length;
    return {
      items,
      studentRollups,
      studentCount: byStudent.size,
      sittingCounts: {
        sittingCount: items.length,
        pendingCount: count('PENDING'),
        inProgressCount: count('IN_PROGRESS'),
        completedCount: count('COMPLETED'),
        incompleteCount: count('INCOMPLETE'),
        absentCount: count('ABSENT'),
        invalidatedCount: count('INVALIDATED'),
      },
    };
  }

  async confirmAbsences(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: ConfirmAbsencesDto,
  ) {
    await this.allow(schoolId, actor, examId, 'examAdmin.markAbsence');
    const member = requireSchoolActor(actor);
    await withTenant(prisma, schoolId, async (tx) => {
      const selectedIds = [...dto.studentProfileIds].sort();
      for (const studentId of selectedIds) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${schoolId}:${examId}:${dto.examSessionId}:${studentId}:absence`}))`;
        const eligible = await tx.$queryRaw<{ ok: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM exam_session_participants participant
            JOIN exam_sessions session
              ON session.school_id = participant.school_id
             AND session.id = participant.exam_session_id
            WHERE participant.school_id = ${schoolId}::uuid
              AND participant.exam_session_id = ${dto.examSessionId}::uuid
              AND participant.student_profile_id = ${studentId}::uuid
              AND participant.status = 'AUTHORIZED'
              AND session.exam_id = ${examId}::uuid
              AND session.status <> 'OPEN'
              AND NOT EXISTS (
                SELECT 1 FROM exam_attempts attempt
                WHERE attempt.school_id = participant.school_id
                  AND attempt.exam_session_id = participant.exam_session_id
                  AND attempt.student_profile_id = participant.student_profile_id
              )
          ) AS ok
        `;
        if (!eligible[0]?.ok) {
          throw new AppHttpException({
            code: 'STALE_ABSENTEE_LIST',
            message: 'A selected student is no longer eligible for absence confirmation.',
          });
        }
        await tx.$executeRaw`
          INSERT INTO exam_participations
            (id, school_id, exam_id, exam_session_id, student_profile_id,
             status, marked_by_membership_id, reason)
          VALUES
            (uuidv7(), ${schoolId}::uuid, ${examId}::uuid, ${dto.examSessionId}::uuid,
             ${studentId}::uuid, 'ABSENT', ${member.membershipId}::uuid, ${dto.reason ?? null})
          ON CONFLICT (school_id, exam_id, exam_session_id, student_profile_id)
          DO UPDATE SET status = 'ABSENT', marked_at = CURRENT_TIMESTAMP,
            marked_by_membership_id = EXCLUDED.marked_by_membership_id,
            reason = EXCLUDED.reason
        `;
      }
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.userId,
      actorRole: this.role(actor),
      action: 'EXAM_PARTICIPATION_MARKED_ABSENT',
      entityType: 'Exam',
      entityId: examId,
      metadata: {
        examSessionId: dto.examSessionId,
        studentProfileIds: dto.studentProfileIds,
        reason: dto.reason ?? null,
      },
    });
    return this.list(schoolId, actor, examId);
  }

  private validateExpiry(expiresAt?: string): void {
    if (expiresAt !== undefined && new Date(expiresAt) <= new Date()) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Authorization expiry must be in the future.',
      });
    }
  }

  private async insertAuthorization(
    tx: Prisma.TransactionClient,
    schoolId: string,
    examId: string,
    type: AttemptAuthorizationType,
    studentProfileId: string,
    sourceId: string,
    reason: string,
    expiresAt: string | undefined,
    membershipId: string,
  ): Promise<AuthorizationRow> {
    const sourceParticipation =
      type === 'MAKEUP'
        ? await tx.examParticipation.findFirst({
            where: {
              schoolId,
              id: sourceId,
              examId,
              studentProfileId,
              status: 'ABSENT',
            },
            select: { examSessionId: true },
          })
        : null;
    const sourceAttempt =
      type === 'RETRY'
        ? await tx.examAttempt.findFirst({
            where: {
              schoolId,
              id: sourceId,
              examId,
              studentProfileId,
              state: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'INVALIDATED'] },
            },
            select: { id: true, examSessionId: true },
          })
        : null;
    if (
      (type === 'MAKEUP' && sourceParticipation?.examSessionId == null) ||
      (type === 'RETRY' && sourceAttempt === null)
    ) {
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'The authorization source is no longer eligible.',
      });
    }

    const rows = await tx.$queryRaw<AuthorizationRow[]>`
      INSERT INTO attempt_authorizations
        (id, school_id, exam_id, student_profile_id, type, reason,
         authorized_by_membership_id, expires_at, source_exam_session_id,
         source_participation_id, source_attempt_id)
      VALUES
        (uuidv7(), ${schoolId}::uuid, ${examId}::uuid, ${studentProfileId}::uuid,
         ${type}::"AttemptAuthorizationType", ${reason}, ${membershipId}::uuid,
         ${expiresAt ? new Date(expiresAt) : null},
         ${sourceParticipation?.examSessionId ?? sourceAttempt?.examSessionId ?? null}::uuid,
         ${type === 'MAKEUP' ? sourceId : null}::uuid,
         ${type === 'RETRY' ? sourceId : null}::uuid)
      ON CONFLICT (school_id, exam_id, student_profile_id, type)
        WHERE status = 'AUTHORIZED'
      DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at,
        source_exam_session_id = EXCLUDED.source_exam_session_id,
        source_participation_id = EXCLUDED.source_participation_id,
        source_attempt_id = EXCLUDED.source_attempt_id,
        authorized_by_membership_id = EXCLUDED.authorized_by_membership_id,
        authorized_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      RETURNING id, student_profile_id AS "studentProfileId", type, status, reason,
        authorized_at AS "authorizedAt", expires_at AS "expiresAt",
        source_exam_session_id AS "sourceExamSessionId",
        source_participation_id AS "sourceParticipationId",
        source_attempt_id AS "sourceAttemptId", used_by_attempt_id AS "usedByAttemptId",
        used_at AS "usedAt", revoked_at AS "revokedAt", revoked_reason AS "revokedReason"
    `;
    return rows[0]!;
  }

  async grant(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    type: AttemptAuthorizationType,
    dto: GrantAttemptAuthorizationDto,
  ) {
    await this.allow(schoolId, actor, examId, 'examAdmin.grantMakeup');
    this.validateExpiry(dto.expiresAt);
    const member = requireSchoolActor(actor);
    const row = await withTenant(prisma, schoolId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${schoolId}:${examId}:${dto.studentProfileId}:authorization`}))`;
      return this.insertAuthorization(
        tx,
        schoolId,
        examId,
        type,
        dto.studentProfileId,
        dto.sourceId,
        dto.reason,
        dto.expiresAt,
        member.membershipId,
      );
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.userId,
      actorRole: this.role(actor),
      action: type === 'MAKEUP' ? 'MAKEUP_GRANTED' : 'ATTEMPT_RETRY_AUTHORIZED',
      entityType: 'AttemptAuthorization',
      entityId: row.id,
      metadata: { examId, studentProfileId: dto.studentProfileId, sourceId: dto.sourceId },
    });
    return toAuthorizationDto(row);
  }

  async grantMakeupBulk(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: BulkGrantMakeupDto,
  ) {
    await this.allow(schoolId, actor, examId, 'examAdmin.grantMakeup');
    this.validateExpiry(dto.expiresAt);
    const member = requireSchoolActor(actor);
    const studentProfileIds = [...dto.studentProfileIds].sort();
    const rows = await withTenant(prisma, schoolId, async (tx) => {
      const result: AuthorizationRow[] = [];
      for (const studentProfileId of studentProfileIds) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${schoolId}:${examId}:${studentProfileId}:authorization`}))`;
        const source = await tx.examParticipation.findFirst({
          where: {
            schoolId,
            examId,
            examSessionId: dto.examSessionId,
            studentProfileId,
            status: 'ABSENT',
          },
          select: { id: true },
        });
        if (source === null) {
          throw new AppHttpException({
            code: 'CONFLICT',
            message: 'Every selected student must have an unresolved absence in this sitting.',
          });
        }
        result.push(
          await this.insertAuthorization(
            tx,
            schoolId,
            examId,
            'MAKEUP',
            studentProfileId,
            source.id,
            dto.reason,
            dto.expiresAt,
            member.membershipId,
          ),
        );
      }
      return result;
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.userId,
      actorRole: this.role(actor),
      action: 'MAKEUP_GRANTED',
      entityType: 'Exam',
      entityId: examId,
      metadata: {
        examSessionId: dto.examSessionId,
        studentProfileIds,
        authorizationIds: rows.map((row) => row.id),
      },
    });
    return { authorizations: rows.map(toAuthorizationDto) };
  }

  async revoke(
    schoolId: string,
    actor: AuthorizedActor,
    id: string,
    dto: RevokeAttemptAuthorizationDto,
  ): Promise<void> {
    const found = await withTenant(prisma, schoolId, (tx) =>
      tx.$queryRaw<{ examId: string; studentProfileId: string }[]>`
        SELECT exam_id AS "examId", student_profile_id AS "studentProfileId"
        FROM attempt_authorizations
        WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid
      `,
    );
    if (found[0] === undefined) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Authorization not found.' });
    }
    await this.allow(schoolId, actor, found[0].examId, 'examAdmin.grantMakeup');
    const member = requireSchoolActor(actor);
    const changed = await withTenant(prisma, schoolId, (tx) =>
      tx.$executeRaw`
        UPDATE attempt_authorizations
        SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP,
            revoked_by_membership_id = ${member.membershipId}::uuid,
            revoked_reason = ${dto.reason}, updated_at = CURRENT_TIMESTAMP
        WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid
          AND status = 'AUTHORIZED'
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      `,
    );
    if (changed === 0) {
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'Only an active unused authorization may be revoked.',
      });
    }
    await this.audit.record({
      schoolId,
      actorUserId: actor.userId,
      actorRole: this.role(actor),
      action: 'ATTEMPT_AUTHORIZATION_REVOKED',
      entityType: 'AttemptAuthorization',
      entityId: id,
      metadata: { examId: found[0].examId, reason: dto.reason },
    });
  }

  async invalidate(
    schoolId: string,
    actor: AuthorizedActor,
    id: string,
    dto: InvalidateAttemptDto,
  ) {
    const attempt = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findUnique({ where: { id }, select: { examId: true } }),
    );
    if (attempt === null) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Attempt not found.' });
    }
    await this.allow(schoolId, actor, attempt.examId, 'examAdmin.invalidateAttempt');
    const member = requireSchoolActor(actor);
    const changed = await withTenant(prisma, schoolId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM exam_attempts WHERE school_id = ${schoolId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const result = await tx.examAttempt.updateMany({
        where: {
          schoolId,
          id,
          state: { in: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'] },
        },
        data: {
          state: 'INVALIDATED',
          invalidationReason: dto.reason,
          invalidatedAt: new Date(),
          invalidatedByMembershipId: member.membershipId,
        },
      });
      if (result.count > 0) {
        await tx.result.updateMany({
          where: { schoolId, attemptId: id, state: { not: 'VOIDED' } },
          data: { state: 'VOIDED' },
        });
      }
      return result.count;
    });
    if (changed === 0) {
      throw new AppHttpException({ code: 'CONFLICT', message: 'Attempt cannot be invalidated.' });
    }
    await this.audit.record({
      schoolId,
      actorUserId: actor.userId,
      actorRole: this.role(actor),
      action: 'ATTEMPT_INVALIDATED',
      entityType: 'ExamAttempt',
      entityId: id,
      metadata: { examId: attempt.examId, reason: dto.reason },
    });
    return { status: 'ok' as const };
  }
}
