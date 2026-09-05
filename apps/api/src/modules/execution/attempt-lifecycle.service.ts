import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { ObjectStorageService } from '../../storage/object-storage.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import { loadExamOrThrow } from '../exams/exam-mappers.js';
import { QUESTION_REVISION_INCLUDE } from '../questions/question-mappers.js';
import { evaluateWriteAdmissibility } from './attempt-admissibility.util.js';
import { evaluateAttemptStartEligibility } from './attempt-eligibility.util.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';
import {
  loadAttemptWithOwnerOrThrow,
  toAttemptStateResponseDto,
  type AttemptWithOwner,
} from './attempt-mappers.js';
import { resolveMediaManifest } from './attempt-media-manifest.util.js';
import { toStudentAttemptQuestions } from './attempt-snapshot-projection.mapper.js';
import { buildSnapshotDocument } from './attempt-snapshot-builder.js';
import {
  CURRENT_ATTEMPT_SNAPSHOT_DOCUMENT_VERSION,
  type AttemptSnapshotDocumentV1,
  type SnapshotSourceQuestion,
} from './attempt-snapshot.types.js';
import type { AttemptPackageResponseDto, AttemptStateResponseDto } from './dto/attempt.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/** Captured by the controller from the raw request — never trusted for
 * anything beyond a neutral binding signal (decision 1). */
export interface AttemptRequestContext {
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  sessionId?: string;
}

const ATTEMPT_SOURCE_EXAM_QUESTION_INCLUDE = {
  revision: { include: QUESTION_REVISION_INCLUDE },
} satisfies Prisma.ExamQuestionInclude;

type ExamQuestionForSnapshot = Prisma.ExamQuestionGetPayload<{
  include: typeof ATTEMPT_SOURCE_EXAM_QUESTION_INCLUDE;
}>;

function toSnapshotSourceQuestions(
  examQuestions: readonly ExamQuestionForSnapshot[],
): SnapshotSourceQuestion[] {
  return examQuestions.map((eq) => ({
    examQuestionId: eq.id,
    questionRevisionId: eq.questionRevisionId,
    sequence: eq.sequence,
    marks: eq.marks,
    questionType: eq.revision.questionType,
    content: eq.revision.content,
    explanation: eq.revision.explanation,
    options: eq.revision.options.map((o) => ({
      optionId: o.id,
      content: o.content,
      originalOrder: o.originalOrder,
      correctFlag: o.correctFlag,
    })),
    media: eq.revision.media.map((m) => ({
      mediaAssetId: m.mediaAssetId,
      displayOrder: m.displayOrder,
      mediaType: m.mediaAsset.type,
    })),
  }));
}

type StartOutcome =
  | { kind: 'INELIGIBLE'; failedChecks: string[] }
  | { kind: 'EXISTING' | 'CREATED'; attemptId: string };

/**
 * `07 §23`–`§24`/`09 §47`: attempt creation, the highest-integrity
 * transaction in the product. `start()`/`resume()` build the full,
 * projected `AttemptPackageResponseDto` (`08 §11.1` step 7); `submit()`/
 * `end()` own only the state transition and answer freeze — marking
 * (`AttemptQuestionResult`/`Result`) is explicitly B14's job, never
 * invoked from here (see `submit()`'s own doc comment).
 */
@Injectable()
export class AttemptLifecycleService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly stream: ExamControlStreamService,
    private readonly storage: ObjectStorageService,
  ) {}

  /**
   * DoD items 1–5, 11, 13, 14, 17: validate-under-lock, create, snapshot —
   * one transaction, so a failure anywhere leaves nothing behind. Two
   * concurrency mechanisms, deliberately layered (defense in depth,
   * matching this codebase's universal pattern): a
   * `pg_advisory_xact_lock` keyed on (school, exam, student) serializes
   * every concurrent start attempt for this exact tuple — needed because a
   * `SELECT ... FOR UPDATE` on the `exam_attempts` row has nothing to
   * attach to on two racing FIRST-time starts (no row exists yet); the
   * `exam_attempts_active_unique` partial index (migration SQL) is the
   * final database-level backstop (DoD item 2).
   */
  async start(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    requestCtx: AttemptRequestContext,
    auditCtx: ActorContext,
  ): Promise<AttemptPackageResponseDto> {
    const exam = await loadExamOrThrow(schoolId, examId);
    const decision = await this.authz.evaluate(actor, 'studentCbt.start', {
      schoolId,
      ownerUserId: actor.userId,
      examId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to start this exam.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    const studentProfile = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId: schoolActor.membershipId } },
        select: { id: true },
      }),
    );
    if (!studentProfile) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'This action requires a student profile.',
      });
    }

    const lockKey = `${schoolId}:${examId}:${studentProfile.id}`;
    const outcome = await withTenant(prisma, schoolId, async (tx): Promise<StartOutcome> => {
      // Serializes every concurrent start() call for this exact
      // (school, exam, student) tuple — see this method's own doc comment.
      // $executeRaw, not $queryRaw — pg_advisory_xact_lock returns void,
      // which Prisma's $queryRaw cannot deserialize ("Failed to
      // deserialize column of type 'void'"); $executeRaw only needs the
      // row count and never tries.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existing = await tx.examAttempt.findFirst({
        where: { schoolId, examId, studentProfileId: studentProfile.id, state: 'IN_PROGRESS' },
        select: { id: true },
      });
      if (existing) {
        return { kind: 'EXISTING', attemptId: existing.id };
      }

      const candidateSessions = await tx.examSessionParticipant.findMany({
        where: {
          schoolId,
          studentProfileId: studentProfile.id,
          status: 'AUTHORIZED',
          session: { schoolId, examId, status: 'OPEN' },
        },
        orderBy: { authorizedAt: 'desc' },
        select: { examSessionId: true, extraTimeSeconds: true, extraTimeGrantedAt: true },
      });
      if (candidateSessions.length === 0) {
        return { kind: 'INELIGIBLE', failedChecks: ['SESSION_NOT_ACCESSIBLE'] };
      }
      // Found in review (B13 gap closure): a student can hold AUTHORIZED
      // participant rows across MORE THAN ONE concurrently OPEN session of
      // the same exam (B12's own confirmed "multiple concurrent open
      // sessions per exam" design — e.g. the OPEN_TO_ELIGIBLE bulk-
      // authorize sweep firing for two parallel labs opened together). An
      // explicit accommodation grant (decision 2) must never be silently
      // dropped just because a DIFFERENT, more-recently-authorized row
      // happens to sort first — prefer whichever candidate actually
      // carries one (most-recently-granted wins on a genuine double
      // grant), falling back to the most-recently-authorized row only when
      // none of them do.
      const accommodatedSession = candidateSessions
        .filter((s) => s.extraTimeSeconds !== null)
        .sort(
          (a, b) => (b.extraTimeGrantedAt?.getTime() ?? 0) - (a.extraTimeGrantedAt?.getTime() ?? 0),
        )[0];
      const session = accommodatedSession ?? candidateSessions[0]!;

      const eligibility = await evaluateAttemptStartEligibility(tx, {
        schoolId,
        exam,
        examSessionId: session.examSessionId,
        studentProfileId: studentProfile.id,
      });
      if (!eligibility.eligible) {
        return { kind: 'INELIGIBLE', failedChecks: eligibility.failedChecks };
      }

      const examQuestions = await tx.examQuestion.findMany({
        where: { schoolId, examId },
        include: ATTEMPT_SOURCE_EXAM_QUESTION_INCLUDE,
        orderBy: { sequence: 'asc' },
      });

      const durationGrantedSeconds = exam.durationSeconds + (session.extraTimeSeconds ?? 0);
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + durationGrantedSeconds * 1000);
      const attemptNumber =
        1 +
        (await tx.examAttempt.count({
          where: { schoolId, examId, studentProfileId: studentProfile.id },
        }));

      const attempt = await tx.examAttempt.create({
        data: {
          schoolId,
          examId,
          examSessionId: session.examSessionId,
          studentProfileId: studentProfile.id,
          attemptNumber,
          state: 'IN_PROGRESS',
          startedAt,
          durationGrantedSeconds,
          expiresAt,
          ...(requestCtx.ipAddress !== undefined && { startIpAddress: requestCtx.ipAddress }),
          ...(requestCtx.userAgent !== undefined && { startUserAgent: requestCtx.userAgent }),
          ...(requestCtx.deviceId !== undefined && { startDeviceId: requestCtx.deviceId }),
          ...(requestCtx.sessionId !== undefined && { startSessionId: requestCtx.sessionId }),
        },
      });

      // ADR-0008: materialised, seeded, immutable once written. The seed
      // is a fresh random value per attempt — never derived from anything
      // predictable to the student (forensic reproducibility needs it
      // stored, not guessable).
      const seed = randomUUID();
      const document = buildSnapshotDocument(toSnapshotSourceQuestions(examQuestions), {
        randomizeQuestions: exam.randomizeQuestions,
        randomizeOptions: exam.randomizeOptions,
        seed,
      });
      await tx.attemptQuestionSnapshot.create({
        data: {
          schoolId,
          attemptId: attempt.id,
          seed,
          documentVersion: CURRENT_ATTEMPT_SNAPSHOT_DOCUMENT_VERSION,
          document: document as unknown as Prisma.InputJsonValue,
        },
      });

      return { kind: 'CREATED', attemptId: attempt.id };
    });

    if (outcome.kind === 'INELIGIBLE') {
      throw new AppHttpException({
        code: 'ATTEMPT_NOT_ELIGIBLE',
        message: 'You are not currently eligible to start this exam.',
        details: { failedChecks: outcome.failedChecks },
      });
    }

    if (outcome.kind === 'CREATED') {
      await this.audit.record({
        schoolId,
        actorUserId: auditCtx.actorUserId,
        actorRole: auditCtx.actorRole,
        action: 'ATTEMPT_STARTED',
        entityType: 'ExamAttempt',
        entityId: outcome.attemptId,
        metadata: { examId },
      });
      await this.stream.publishUpdate(schoolId, examId);
    }

    const attempt = await loadAttemptWithOwnerOrThrow(schoolId, outcome.attemptId);
    return this.buildAttemptPackage(schoolId, attempt);
  }

  /** `GET /v1/attempts/:id` — DoD item 5: refresh returns byte-identical
   * ordering and every saved answer, since the snapshot document is never
   * recomputed and every answer is read fresh. */
  async resume(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
  ): Promise<AttemptPackageResponseDto> {
    const attempt = await loadAttemptWithOwnerOrThrow(schoolId, attemptId);
    const decision = await this.authz.evaluate(actor, 'studentCbt.resume', {
      schoolId,
      ownerUserId: attempt.studentProfile.membership.userId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to view this attempt.',
      });
    }
    return this.buildAttemptPackage(schoolId, attempt);
  }

  /**
   * `POST /v1/attempts/:id/submit` — the state transition and answer
   * freeze ONLY. Deliberately, explicitly does NOT enqueue marking, does
   * NOT compute a score, and does NOT touch `AttemptQuestionResult`/
   * `Result` — neither table exists until B14. The admissibility check
   * mirrors the answer-save path's own ADR-0003 window (a submission
   * arriving well past expiry-plus-grace is refused the same way a late
   * answer is, rather than freezing an attempt at an arbitrarily-delayed
   * moment) — B14 hooks its own marking-queue enqueue immediately after
   * the transition below commits.
   */
  async submit(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    receivedAt: Date,
    auditCtx: ActorContext,
  ): Promise<AttemptStateResponseDto> {
    const attempt = await loadAttemptWithOwnerOrThrow(schoolId, attemptId);
    const decision = await this.authz.evaluate(actor, 'studentCbt.submit', {
      schoolId,
      ownerUserId: attempt.studentProfile.membership.userId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to submit this attempt.',
      });
    }

    if (attempt.state === 'IN_PROGRESS') {
      const admissibility = evaluateWriteAdmissibility(attempt.expiresAt, receivedAt);
      if (admissibility === 'REJECTED') {
        throw new AppHttpException({
          code: 'ATTEMPT_WRITE_WINDOW_CLOSED',
          message: 'This attempt has expired and the grace window has closed.',
        });
      }
    }

    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.updateMany({
        where: { schoolId, id: attemptId, state: 'IN_PROGRESS' },
        data: { state: 'SUBMITTED', submittedAt: receivedAt },
      }),
    );

    if (count === 0) {
      // DoD item 9: a repeated identical submit is idempotent — if the
      // attempt is ALREADY in the state this call would have produced,
      // return it as a clean success rather than an error.
      const current = await loadAttemptWithOwnerOrThrow(schoolId, attemptId);
      if (current.state === 'SUBMITTED' || current.state === 'AUTO_SUBMITTED') {
        return toAttemptStateResponseDto(current);
      }
      throw new AppHttpException({
        code: 'ATTEMPT_NOT_WRITABLE',
        message: 'This attempt can no longer be submitted.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'ATTEMPT_SUBMITTED',
      entityType: 'ExamAttempt',
      entityId: attemptId,
    });
    await this.stream.publishUpdate(schoolId, attempt.examId);

    // B14 hooks marking-queue enqueue here, after the transition commits.

    const updated = await loadAttemptWithOwnerOrThrow(schoolId, attemptId);
    return toAttemptStateResponseDto(updated);
  }

  /** `POST /v1/attempts/:id/end` — staff-initiated end, `examAdmin
   * .endAttempt`. Transitions to `SUBMITTED` (07 §16 names no distinct
   * "ended by staff" terminal state) — distinguished from a student's own
   * submission only by its own `ATTEMPT_ENDED_BY_STAFF` audit action. */
  async end(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    auditCtx: ActorContext,
  ): Promise<AttemptStateResponseDto> {
    const attempt = await loadAttemptWithOwnerOrThrow(schoolId, attemptId);
    const exam = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.findUniqueOrThrow({
        where: { id: attempt.examId },
        select: { createdByMembershipId: true, departmentId: true },
      }),
    );
    const decision = await this.authz.evaluate(actor, 'examAdmin.endAttempt', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      examId: attempt.examId,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to end this attempt.',
      });
    }

    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.updateMany({
        where: { schoolId, id: attemptId, state: 'IN_PROGRESS' },
        data: { state: 'SUBMITTED', submittedAt: new Date() },
      }),
    );
    if (count === 0) {
      throw new AppHttpException({
        code: 'ATTEMPT_NOT_WRITABLE',
        message: 'This attempt is not currently in progress.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'ATTEMPT_ENDED_BY_STAFF',
      entityType: 'ExamAttempt',
      entityId: attemptId,
    });
    await this.stream.publishUpdate(schoolId, attempt.examId);

    const updated = await loadAttemptWithOwnerOrThrow(schoolId, attemptId);
    return toAttemptStateResponseDto(updated);
  }

  private async buildAttemptPackage(
    schoolId: string,
    attempt: AttemptWithOwner,
  ): Promise<AttemptPackageResponseDto> {
    if (!attempt.snapshot) {
      // Structurally impossible — start()'s own transaction always writes
      // the attempt and its snapshot together, or neither (DoD item 1).
      throw new AppHttpException({
        code: 'INTERNAL',
        message: 'This attempt has no snapshot.',
        httpStatus: 500,
      });
    }
    const document = attempt.snapshot.document as unknown as AttemptSnapshotDocumentV1;

    const examMeta = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.findUniqueOrThrow({
        where: { id: attempt.examId },
        select: {
          navigationPolicy: true,
          generalInstructions: true,
          navigationInstructions: true,
        },
      }),
    );

    const answers = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAnswer.findMany({
        where: { schoolId, attemptId: attempt.id },
        select: { examQuestionId: true, selectedOptionId: true, sequenceNumber: true },
      }),
    );
    const answersByQuestion = new Map(
      answers.map((a) => [
        a.examQuestionId,
        { selectedOptionId: a.selectedOptionId, sequenceNumber: a.sequenceNumber },
      ]),
    );

    const mediaUrls = await resolveMediaManifest(this.storage, schoolId, document);
    const questions = toStudentAttemptQuestions(document, answersByQuestion, mediaUrls);

    return {
      attemptId: attempt.id,
      examId: attempt.examId,
      examSessionId: attempt.examSessionId,
      state: attempt.state,
      startedAt: attempt.startedAt.toISOString(),
      expiresAt: attempt.expiresAt.toISOString(),
      serverTime: new Date().toISOString(),
      navigationPolicy: examMeta.navigationPolicy,
      generalInstructions: examMeta.generalInstructions,
      navigationInstructions: examMeta.navigationInstructions,
      questions,
    };
  }
}
