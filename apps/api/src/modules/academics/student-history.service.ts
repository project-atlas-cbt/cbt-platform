import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import type {
  HistoryEventDto,
  HistoryOutcomeDto,
  HistorySessionDto,
  StudentHistoryResponseDto,
} from './dto/student-history.dto.js';

/** Registrations created this close to their enrollment were made by the
 * enrollment itself (compulsory subjects plus any carried over). */
const SAME_STEP_MS = 10_000;

const OUTCOME_LABELS: Record<string, string> = {
  PROMOTE: 'Promoted',
  REPEAT: 'Repeated the class',
  TRANSFER: 'Transferred out',
  GRADUATE: 'Graduated',
  WITHDRAW: 'Withdrawn',
};

const ENDED_STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Completed the session',
  WITHDRAWN: 'Withdrawn',
};

const ACCOUNT_SUMMARIES: Record<string, string> = {
  STUDENT_CREATED: 'Account created',
  STUDENT_UPDATED: 'Details updated',
  STUDENT_CREDENTIALS_RESET: 'Sign-in details reset',
  STUDENT_SIGN_IN_UNLOCKED: 'Sign-in unlocked',
  STUDENT_DEACTIVATED: 'Account deactivated',
  STUDENT_REACTIVATED: 'Account reactivated',
};

function humanise(action: string): string {
  const words = action
    .toLowerCase()
    .replace(/^student_/, '')
    .split('_');
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const byNewest = (a: HistoryEventDto, b: HistoryEventDto) => b.at.localeCompare(a.at);

/**
 * A student's academic history, one block per session (2026-10-09 redesign,
 * `departments-review/academic-history.md`). Read-only, assembled from the
 * authoritative tables (enrollments, registrations, rollover decisions,
 * exam participation), with the audit log supplying who made each change
 * and when. Nothing is stored for it, so it can never drift from the
 * records it describes.
 */
@Injectable()
export class StudentHistoryService {
  async forStudent(schoolId: string, studentProfileId: string): Promise<StudentHistoryResponseDto> {
    return withTenant(prisma, schoolId, async (tx) => {
      const profile = await tx.studentProfile.findUnique({
        where: { schoolId_id: { schoolId, id: studentProfileId } },
        select: { id: true },
      });
      if (!profile)
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Student not found.' });

      const enrollments = await tx.studentEnrollment.findMany({
        where: { schoolId, studentProfileId },
        include: {
          classGroupSession: { select: { name: true } },
          session: { select: { id: true, name: true, startDate: true, status: true } },
          registrations: {
            include: { classSubject: { select: { subject: { select: { name: true } } } } },
          },
        },
        orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      });
      const enrollmentIds = enrollments.map((e) => e.id);
      const registrationIds = enrollments.flatMap((e) => e.registrations.map((r) => r.id));
      const decisions = await tx.rolloverDecision.findMany({
        where: { schoolId, sourceEnrollmentId: { in: enrollmentIds }, committedAt: { not: null } },
      });
      const audits = await tx.auditEvent.findMany({
        where: {
          schoolId,
          entityId: {
            in: [profile.id, ...enrollmentIds, ...registrationIds, ...decisions.map((d) => d.id)],
          },
        },
        orderBy: { occurredAt: 'asc' },
      });
      const actorIds = [...new Set(audits.map((a) => a.actorUserId))];
      const actors = new Map(
        (
          await tx.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, displayName: true },
          })
        ).map((u) => [u.id, u.displayName]),
      );
      const participations = await tx.examParticipation.findMany({
        where: { schoolId, studentProfileId },
        select: { status: true, examId: true, exam: { select: { academicSessionId: true } } },
      });

      const auditsFor = (entityId: string) => audits.filter((a) => a.entityId === entityId);
      const event = (
        at: Date,
        kind: HistoryEventDto['kind'],
        summary: string,
        detail: string | null,
        audit?: { actorUserId: string; actorRole: string },
      ): HistoryEventDto => ({
        at: at.toISOString(),
        kind,
        summary,
        detail,
        actorName: audit ? (actors.get(audit.actorUserId) ?? null) : null,
        actorRole: audit ? audit.actorRole : null,
      });
      const subjectsAtEnd = (e: (typeof enrollments)[number]) =>
        e.registrations
          .filter((r) => r.status === 'REGISTERED')
          .map((r) => r.classSubject.subject.name)
          .sort((a, b) => a.localeCompare(b));

      const sessions = new Map<string, HistorySessionDto>();
      enrollments.forEach((e, i) => {
        const prev = i > 0 ? enrollments[i - 1] : undefined;
        let block = sessions.get(e.academicSessionId);
        if (!block) {
          block = {
            academicSessionId: e.academicSessionId,
            sessionName: e.session.name,
            className: e.classGroupSession.name,
            current: e.session.status === 'CURRENT',
            subjects: [],
            events: [],
            outcome: null,
            exams: { attended: 0, absent: 0, excused: 0 },
          };
          sessions.set(e.academicSessionId, block);
        }
        block.className = e.classGroupSession.name;
        block.subjects = subjectsAtEnd(e);

        // How the student came to be in this class, and with which subjects.
        const startSubjects = e.registrations.filter(
          (r) => r.createdAt.getTime() - e.createdAt.getTime() < SAME_STEP_MS,
        );
        const startNames = new Set(startSubjects.map((r) => r.classSubject.subject.name));
        const notCarried = prev ? subjectsAtEnd(prev).filter((n) => !startNames.has(n)) : [];
        const detailParts = [
          startSubjects.length === 1 ? '1 subject' : `${startSubjects.length} subjects`,
        ];
        if (notCarried.length > 0) detailParts.push(`not offered here: ${notCarried.join(', ')}`);
        const detail = detailParts.join('; ');
        const own = auditsFor(e.id)[0];
        const sameSession = prev?.academicSessionId === e.academicSessionId;
        if (prev && (sameSession || own?.action === 'CLASS_CHANGED')) {
          block.events.push(
            event(
              e.createdAt,
              'MOVED',
              `Moved ${prev.classGroupSession.name} → ${e.classGroupSession.name}`,
              detail,
              own,
            ),
          );
        } else if (prev && !own) {
          const decision = decisions.find((d) => d.sourceEnrollmentId === prev.id);
          const how = decision?.outcome === 'REPEAT' ? 'repeating' : 'from';
          block.events.push(
            event(
              e.createdAt,
              'STARTED_SESSION',
              `Started in ${e.classGroupSession.name} (${how} ${prev.classGroupSession.name})`,
              detail,
              decision ? auditsFor(decision.id)[0] : undefined,
            ),
          );
        } else {
          block.events.push(
            event(e.createdAt, 'ENROLLED', `Enrolled in ${e.classGroupSession.name}`, detail, own),
          );
        }

        // Subject changes after that.
        for (const r of e.registrations) {
          const name = r.classSubject.subject.name;
          const regAudits = auditsFor(r.id);
          if (regAudits.length > 0) {
            for (const a of regAudits) {
              const dropped = a.action === 'STUDENT_SUBJECT_DEREGISTERED';
              block.events.push(
                event(
                  a.occurredAt,
                  dropped ? 'SUBJECT_DROPPED' : 'SUBJECT_ADDED',
                  `${name} ${dropped ? 'dropped' : 'added'}`,
                  null,
                  a,
                ),
              );
            }
            continue;
          }
          if (r.createdAt.getTime() - e.createdAt.getTime() >= SAME_STEP_MS) {
            block.events.push(event(r.registeredAt, 'SUBJECT_ADDED', `${name} added`, null));
          }
          if (r.status === 'DEREGISTERED' && r.deregisteredAt) {
            block.events.push(event(r.deregisteredAt, 'SUBJECT_DROPPED', `${name} dropped`, null));
          }
        }

        const decision = decisions.find((d) => d.sourceEnrollmentId === e.id);
        if (decision) {
          const commit = auditsFor(decision.id)[0];
          const outcome: HistoryOutcomeDto = {
            label: OUTCOME_LABELS[decision.outcome] ?? humanise(decision.outcome),
            reason: decision.reason || null,
            actorName: commit ? (actors.get(commit.actorUserId) ?? null) : null,
          };
          block.outcome = outcome;
        } else if (ENDED_STATUS_LABELS[e.status]) {
          block.outcome = { label: ENDED_STATUS_LABELS[e.status]!, reason: null, actorName: null };
        }
      });

      // Exams per session, one count per exam: a makeup that was sat
      // outranks the absence it made up for.
      const rank = { PENDING: 0, ABSENT: 1, EXCUSED: 2, ATTENDED: 3 } as const;
      const perExam = new Map<string, { status: keyof typeof rank; sessionId: string }>();
      for (const p of participations) {
        const best = perExam.get(p.examId);
        if (!best || rank[p.status] > rank[best.status]) {
          perExam.set(p.examId, { status: p.status, sessionId: p.exam.academicSessionId });
        }
      }
      for (const { status, sessionId } of perExam.values()) {
        const exams = sessions.get(sessionId)?.exams;
        if (!exams) continue;
        if (status === 'ATTENDED') exams.attended += 1;
        else if (status === 'ABSENT') exams.absent += 1;
        else if (status === 'EXCUSED') exams.excused += 1;
      }

      const ordered = [...sessions.values()];
      const startOf = new Map(enrollments.map((e) => [e.academicSessionId, e.session.startDate]));
      ordered.sort(
        (a, b) =>
          startOf.get(b.academicSessionId)!.getTime() - startOf.get(a.academicSessionId)!.getTime(),
      );
      for (const s of ordered) s.events.sort(byNewest);

      const accountEvents = auditsFor(profile.id)
        .map((a) =>
          event(
            a.occurredAt,
            'ACCOUNT',
            ACCOUNT_SUMMARIES[a.action] ?? humanise(a.action),
            null,
            a,
          ),
        )
        .sort(byNewest);

      return { sessions: ordered, accountEvents };
    });
  }
}
