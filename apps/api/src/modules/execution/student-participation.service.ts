import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { classifyAttemptParticipation } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import type {
  AuthorizationStatus,
  AuthorizationType,
  ParticipationClassification,
  ParticipationStatus,
} from './dto/participation.dto.js';

type Row = {
  examId: string;
  examTitle: string;
  subjectName: string;
  examSessionId: string;
  participationStatus: ParticipationStatus;
  attemptState: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'INVALIDATED' | 'CANCELLED' | null;
  authorizationType: AuthorizationType | null;
  authorizationStatus: AuthorizationStatus | null;
  markedAt: Date | null;
};

export interface StudentParticipationHistoryItem {
  examId: string;
  examTitle: string;
  subjectName: string;
  examSessionId: string;
  participationStatus: ParticipationStatus;
  classification: ParticipationClassification;
  attemptState: Row['attemptState'];
  authorizationType: AuthorizationType | null;
  authorizationStatus: AuthorizationStatus | null;
  markedAt: string | null;
}

@Injectable()
export class StudentParticipationService {
  constructor(private readonly authz: AuthorizationService) {}

  async list(
    schoolId: string,
    actor: AuthorizedActor,
  ): Promise<{ items: StudentParticipationHistoryItem[] }> {
    if (actor.kind !== 'SCHOOL' || !actor.roles.includes('STUDENT')) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'Only a student may view participation history.',
      });
    }
    const decision = await this.authz.evaluate(actor, 'analytics.studentHistory', {
      schoolId,
      ownerUserId: actor.userId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'Only a student may view participation history.',
      });
    }

    const profile = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId: actor.membershipId } },
        select: { id: true },
      }),
    );
    if (!profile) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'Only a student may view participation history.',
      });
    }

    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.$queryRaw<Row[]>`
        SELECT exam.id AS "examId", exam.title AS "examTitle",
               subject.name AS "subjectName", participant.exam_session_id AS "examSessionId",
               COALESCE(participation.status::text, 'PENDING') AS "participationStatus",
               attempt.state::text AS "attemptState",
               authorization.type::text AS "authorizationType",
               CASE
                 WHEN authorization.status = 'AUTHORIZED'
                  AND authorization.expires_at <= CURRENT_TIMESTAMP THEN 'EXPIRED'
                 ELSE authorization.status::text
               END AS "authorizationStatus",
               participation.marked_at AS "markedAt"
        FROM exam_session_participants participant
        JOIN exam_sessions session
          ON session.school_id = participant.school_id AND session.id = participant.exam_session_id
        JOIN exams exam ON exam.school_id = session.school_id AND exam.id = session.exam_id
        JOIN subjects subject ON subject.school_id = exam.school_id AND subject.id = exam.subject_id
        LEFT JOIN exam_participations participation
          ON participation.school_id = participant.school_id
         AND participation.exam_id = exam.id
         AND participation.exam_session_id = participant.exam_session_id
         AND participation.student_profile_id = participant.student_profile_id
        LEFT JOIN LATERAL (
          SELECT current_attempt.state
          FROM exam_attempts current_attempt
          WHERE current_attempt.school_id = participant.school_id
            AND current_attempt.exam_session_id = participant.exam_session_id
            AND current_attempt.student_profile_id = participant.student_profile_id
          ORDER BY current_attempt.attempt_number DESC
          LIMIT 1
        ) attempt ON true
        LEFT JOIN LATERAL (
          SELECT current_authorization.type, current_authorization.status,
                 current_authorization.expires_at
          FROM attempt_authorizations current_authorization
          WHERE current_authorization.school_id = participant.school_id
            AND current_authorization.exam_id = exam.id
            AND current_authorization.student_profile_id = participant.student_profile_id
          ORDER BY current_authorization.authorized_at DESC
          LIMIT 1
        ) authorization ON true
        WHERE participant.school_id = ${schoolId}::uuid
          AND participant.student_profile_id = ${profile.id}::uuid
          AND participant.status = 'AUTHORIZED'
        ORDER BY session.opened_at DESC
      `,
    );

    return {
      items: rows.map((row) => ({
        ...row,
        classification: classifyAttemptParticipation(row),
        markedAt: row.markedAt?.toISOString() ?? null,
      })),
    };
  }
}
