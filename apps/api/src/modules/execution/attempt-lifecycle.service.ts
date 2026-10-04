import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { ensureProcessingResult } from '../results/result-finalization.util.js';
import { ObjectStorageService } from '../../storage/object-storage.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import {
  CURRENT_ATTEMPT_SNAPSHOT_DOCUMENT_VERSION,
  evaluateWriteAdmissibility,
  type AttemptSnapshotDocumentV1,
} from '@atlas/domain';
import { AuditService } from '../operations/audit-event.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import { loadExamOrThrow } from '../exams/exam-mappers.js';
import { QUESTION_REVISION_INCLUDE } from '../questions/question-mappers.js';
import { evaluateAttemptStartEligibility } from './attempt-eligibility.util.js';
import { AttemptFinalizationService } from './attempt-finalization.service.js';
import { AttemptMarkingQueueService } from './attempt-marking-queue.service.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';
import {
  loadAttemptHeaderOrThrow,
  loadAttemptWithOwnerOrThrow,
  toAttemptStateResponseDto,
  type AttemptWithOwner,
} from './attempt-mappers.js';
import { resolveMediaManifest } from './attempt-media-manifest.util.js';
import { toStudentAttemptQuestions } from './attempt-snapshot-projection.mapper.js';
import { buildSnapshotDocument } from './attempt-snapshot-builder.js';
import type { SnapshotSourceQuestion } from './attempt-snapshot.types.js';
import type { AttemptPackageResponseDto, AttemptStateResponseDto } from './dto/attempt.dto.js';
import { CRITICAL_SPANS, withSpan } from '@atlas/observability';
import { ExamTelemetryService } from './exam-telemetry.service.js';
import { ExamMediaPrecacheService } from './media-precache/exam-media-precache.service.js';

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
  | { kind: 'AUTHORIZATION_ALREADY_CONSUMED' }
  | { kind: 'EXISTING' | 'CREATED'; attemptId: string };

/**
 * `07 §23`–`§24`/`09 §47`: attempt creation, the highest-integrity
 * transaction in the product. `start()`/`resume()` build the full,
 * projected `AttemptPackageResponseDto` (`08 §11.1` step 7); `submit()`/
 * `end()` own the state transition and answer freeze, then (B14) enqueue
 * marking onto the shared `ATTEMPT_MARKING_QUEUE_NAME` queue — never
 * perform marking itself, and never touch `AttemptQuestionResult` directly
 * (see `submit()`'s own doc comment).
 */
@Injectable()
export class AttemptLifecycleService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly stream: ExamControlStreamService,
    private readonly storage: ObjectStorageService,
    private readonly finalization: AttemptFinalizationService,
    private readonly marking: AttemptMarkingQueueService,
    private readonly telemetry: ExamTelemetryService,
    private readonly precache: ExamMediaPrecacheService,
  ) {}

  // ---- B20 critical-flow instrumentation (08 §18 tracing; 09 §36) -------
  // Thin wrappers: the span and the metrics surround the unchanged
  // transactional bodies below (startInner/submitInner/endInner), so the
  // instrumentation can never alter what those transactions do. Span
  // attributes are ids only — never names or answer content.

  async start(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    requestCtx: AttemptRequestContext,
    auditCtx: ActorContext,
  ): Promise<AttemptPackageResponseDto> {
    return withSpan(
      CRITICAL_SPANS.attemptStart,
      { 'atlas.school_id': schoolId, 'atlas.exam_id': examId },
      async (span) => {
        const pkg = await this.startInner(schoolId, actor, examId, requestCtx, auditCtx);
        span.setAttribute('atlas.attempt_id', pkg.attemptId);
        this.telemetry.attemptStarted();
        return pkg;
      },
    );
  }

  async submit(
    ...args: Parameters<AttemptLifecycleService['submitInner']>
  ): ReturnType<AttemptLifecycleService['submitInner']> {
    const [schoolId, , attemptId] = args;
    const began = performance.now();
    return withSpan(
      CRITICAL_SPANS.attemptSubmit,
      { 'atlas.school_id': schoolId, 'atlas.attempt_id': attemptId, 'atlas.submit_kind': 'manual' },
      async () => {
        const result = await this.submitInner(...args);
        this.telemetry.submission('manual', performance.now() - began);
        return result;
      },
    );
  }

  async end(
    ...args: Parameters<AttemptLifecycleService['endInner']>
  ): ReturnType<AttemptLifecycleService['endInner']> {
    const [schoolId, , attemptId] = args;
    const began = performance.now();
    return withSpan(
      CRITICAL_SPANS.attemptSubmit,
      {
        'atlas.school_id': schoolId,
        'atlas.attempt_id': attemptId,
        'atlas.submit_kind': 'staff_end',
      },
      async () => {
        const result = await this.endInner(...args);
        this.telemetry.submission('staff_end', performance.now() - began);
        return result;
      },
    );
  }

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
  private async startInner(
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

      // Completion (and every other exam-row writer: lifecycle, session
      // open/close) takes FOR UPDATE on this row. Holding a SHARE lock for
      // the whole start transaction means completion either observes this
      // new IN_PROGRESS attempt or finishes first, in which case the current
      // session state below rejects an ordinary post-completion start.
      // B21: FOR SHARE, not FOR UPDATE — shared locks don't conflict with
      // each other, so different students' starts no longer queue behind
      // one another on the exam row (measured: the single largest statement
      // by total time at 100 concurrent starts), while still conflicting
      // with every FOR UPDATE writer exactly as before. Same-student
      // duplicates stay serialised by the advisory lock above.
      await tx.$queryRaw`
        SELECT id FROM exams
        WHERE id = ${examId}::uuid AND school_id = ${schoolId}::uuid
        FOR SHARE
      `;

      const existing = await tx.examAttempt.findFirst({
        where: { schoolId, examId, studentProfileId: studentProfile.id, state: 'IN_PROGRESS' },
        select: { id: true, attemptAuthorizationId: true },
      });
      if (existing) {
        // An ordinary duplicate start remains B13-idempotent. An
        // authorization-owned start is intentionally different: ADR-0014
        // requires exactly one successful consumption, so a racing request
        // must not be reported as a second success merely because it can
        // resume the newly-created attempt. The student resumes through the
        // normal GET attempt route after the first successful start.
        if (existing.attemptAuthorizationId !== null) {
          return { kind: 'AUTHORIZATION_ALREADY_CONSUMED' };
        }
        return { kind: 'EXISTING', attemptId: existing.id };
      }

      // A dedicated MAKEUP/SPECIAL session remains startable after its
      // parent exam is completed, but only when a still-valid authorization
      // selects it below. The ordinary eligibility check continues to reject
      // completed-parent sessions for every standard start.
      const candidateSessions = await tx.examSessionParticipant.findMany({
        where: {
          schoolId,
          studentProfileId: studentProfile.id,
          status: 'AUTHORIZED',
          session: {
            schoolId,
            examId,
            status: 'OPEN',
            exam: { status: { in: ['OPEN', 'COMPLETED'] } },
          },
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
      const now = new Date();
      await tx.attemptAuthorization.updateMany({
        where: {
          schoolId,
          examId,
          studentProfileId: studentProfile.id,
          status: 'AUTHORIZED',
          expiresAt: { lte: now },
        },
        data: { status: 'EXPIRED' },
      });
      const authorization = await tx.attemptAuthorization.findFirst({
        where: {
          schoolId,
          examId,
          studentProfileId: studentProfile.id,
          status: 'AUTHORIZED',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          examSessionId: { in: candidateSessions.map((candidate) => candidate.examSessionId) },
        },
        orderBy: { authorizedAt: 'asc' },
        select: { id: true, type: true, examSessionId: true },
      });
      const authorizedSession = authorization
        ? candidateSessions.find(
            (candidate) => candidate.examSessionId === authorization.examSessionId,
          )
        : undefined;
      const accommodatedSession = candidateSessions
        .filter((s) => s.extraTimeSeconds !== null)
        .sort(
          (a, b) => (b.extraTimeGrantedAt?.getTime() ?? 0) - (a.extraTimeGrantedAt?.getTime() ?? 0),
        )[0];
      const session = authorizedSession ?? accommodatedSession ?? candidateSessions[0]!;

      const eligibility = await evaluateAttemptStartEligibility(tx, {
        schoolId,
        exam,
        examSessionId: session.examSessionId,
        studentProfileId: studentProfile.id,
        ...(authorization !== null && { authorization: { id: authorization.id } }),
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

      if (authorization !== null) {
        const consumptionTime = new Date();
        const consumed = await tx.attemptAuthorization.updateMany({
          where: {
            id: authorization.id,
            schoolId,
            status: 'AUTHORIZED',
            OR: [{ expiresAt: null }, { expiresAt: { gt: consumptionTime } }],
          },
          data: { status: 'USED', usedAt: consumptionTime },
        });
        if (consumed.count !== 1) {
          throw new AppHttpException({
            code: 'ATTEMPT_NOT_ELIGIBLE',
            message: 'This authorization is no longer available.',
          });
        }
      }

      const attempt = await tx.examAttempt.create({
        data: {
          schoolId,
          examId,
          examSessionId: session.examSessionId,
          studentProfileId: studentProfile.id,
          ...(authorization !== null && {
            attemptAuthorizationId: authorization.id,
            attemptType: authorization.type,
          }),
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

      await tx.examParticipation.upsert({
        where: {
          schoolId_examSessionId_studentProfileId: {
            schoolId,
            examSessionId: session.examSessionId,
            studentProfileId: studentProfile.id,
          },
        },
        create: {
          schoolId,
          examId,
          examSessionId: session.examSessionId,
          studentProfileId: studentProfile.id,
          status: 'ATTENDED',
          markedByMembershipId: schoolActor.membershipId,
        },
        update: {
          status: 'ATTENDED',
          markedAt: new Date(),
          markedByMembershipId: schoolActor.membershipId,
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
    if (outcome.kind === 'AUTHORIZATION_ALREADY_CONSUMED') {
      throw new AppHttpException({
        code: 'ATTEMPT_NOT_ELIGIBLE',
        message: 'The authorization has already been consumed.',
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
      await this.stream.publishSoon(schoolId, examId);
    }

    const attempt = await loadAttemptWithOwnerOrThrow(schoolId, outcome.attemptId);
    return this.buildAttemptPackage(schoolId, attempt);
  }

  /** `GET /v1/attempts/:id` — DoD item 5: refresh returns byte-identical
   * ordering and every saved answer, since the snapshot document is never
   * recomputed and every answer is read fresh.
   *
   * B14, opportunistic-finalisation touchpoint (ADR-0004: "any server
   * request touching an expired attempt finalises it immediately") — not
   * one of the roadmap's own named "natural candidates" (heartbeat,
   * answer-write, submit, status), included for literal completeness so a
   * student reloading an expired-but-not-yet-finalised attempt sees the
   * correct terminal state immediately rather than a stale IN_PROGRESS
   * package until the next heartbeat/sweep tick. */
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

    if (attempt.state !== 'IN_PROGRESS') {
      return this.buildAttemptPackage(schoolId, attempt);
    }
    await this.finalization.finalizeIfExpired(schoolId, attemptId, new Date());
    const current = await loadAttemptWithOwnerOrThrow(schoolId, attemptId);
    return this.buildAttemptPackage(schoolId, current);
  }

  /**
   * `POST /v1/attempts/:id/submit` — the state transition and answer
   * freeze, PLUS (B14) enqueuing marking once that transition commits.
   * Never marks synchronously inline — the roadmap's own "Submission →
   * queue marking, keeping the interactive path minimal" — and never
   * touches `AttemptQuestionResult` itself; that's the marking job's job.
   *
   * The admissibility check mirrors the answer-save path's own ADR-0003
   * window. B14 changed its own `REJECTED` branch (confirmed decision,
   * this phase's planning session): a manual submit arriving past the
   * grace window is now treated the same as any other "server request
   * touching an expired attempt" (ADR-0004) — finalized to
   * `AUTO_SUBMITTED` and returned as an ordinary success, not the `400
   * ATTEMPT_WRITE_WINDOW_CLOSED` B13 left here (which pre-dated any
   * mechanism that could actually resolve the underlying condition).
   */
  private async submitInner(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    receivedAt: Date,
    auditCtx: ActorContext,
  ): Promise<AttemptStateResponseDto> {
    const attempt = await loadAttemptHeaderOrThrow(schoolId, attemptId);
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
        await this.finalization.finalizeIfExpired(schoolId, attemptId, receivedAt);
        const current = await loadAttemptHeaderOrThrow(schoolId, attemptId);
        return toAttemptStateResponseDto(current);
      }
    }

    const { count } = await withTenant(prisma, schoolId, async (tx) => {
      const transition = await tx.examAttempt.updateMany({
        where: { schoolId, id: attemptId, state: 'IN_PROGRESS' },
        data: { state: 'SUBMITTED', submittedAt: receivedAt },
      });
      // B15: the result is created PROCESSING in the SAME transaction as the
      // transition (07 §29), so an attempt can never be finalised without a
      // result row to account for it — see ensureProcessingResult's own doc
      // comment for why finalisation owns this rather than the marking job.
      if (transition.count > 0) {
        await ensureProcessingResult(tx, {
          schoolId,
          attemptId,
          examId: attempt.examId,
          studentProfileId: attempt.studentProfileId,
        });
      }
      return transition;
    });

    if (count === 0) {
      // DoD item 9: a repeated identical submit is idempotent — if the
      // attempt is ALREADY in the state this call would have produced,
      // return it as a clean success rather than an error.
      const current = await loadAttemptHeaderOrThrow(schoolId, attemptId);
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
    await this.stream.publishSoon(schoolId, attempt.examId);
    await this.marking.enqueue({ schoolId, attemptId }, `mark-${attemptId}`);

    const updated = await loadAttemptHeaderOrThrow(schoolId, attemptId);
    return toAttemptStateResponseDto(updated);
  }

  /** `POST /v1/attempts/:id/end` — staff-initiated end, `examAdmin
   * .endAttempt`. Transitions to `SUBMITTED` (07 §16 names no distinct
   * "ended by staff" terminal state) — distinguished from a student's own
   * submission only by its own `ATTEMPT_ENDED_BY_STAFF` audit action. */
  private async endInner(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    auditCtx: ActorContext,
  ): Promise<AttemptStateResponseDto> {
    const attempt = await loadAttemptHeaderOrThrow(schoolId, attemptId);
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

    const { count } = await withTenant(prisma, schoolId, async (tx) => {
      const transition = await tx.examAttempt.updateMany({
        where: { schoolId, id: attemptId, state: 'IN_PROGRESS' },
        data: { state: 'SUBMITTED', submittedAt: new Date() },
      });
      if (transition.count > 0) {
        await ensureProcessingResult(tx, {
          schoolId,
          attemptId,
          examId: attempt.examId,
          studentProfileId: attempt.studentProfileId,
        });
      }
      return transition;
    });
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
    await this.marking.enqueue({ schoolId, attemptId }, `mark-${attemptId}`);

    const updated = await loadAttemptHeaderOrThrow(schoolId, attemptId);
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
          durationSeconds: true,
        },
      }),
    );
    // F20 (DoD 3): the larger-text accommodation is read live from the
    // participant row this attempt was started under (a display concern,
    // not frozen); extra time is the frozen difference already in expiresAt.
    const participant = await withTenant(prisma, schoolId, (tx) =>
      tx.examSessionParticipant.findUnique({
        where: {
          schoolId_examSessionId_studentProfileId: {
            schoolId,
            examSessionId: attempt.examSessionId,
            studentProfileId: attempt.studentProfileId,
          },
        },
        select: { largerText: true },
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
      invalidationReason: attempt.invalidationReason,
      // F20 (ADR-0021 amendment): the pre-cached ciphertext's key — only
      // while the attempt may render questions. This method serves only the
      // owner (start/resume are owner-authorized).
      mediaKey:
        attempt.state === 'IN_PROGRESS'
          ? this.precache.mediaKeyFor(schoolId, attempt.examId)
          : null,
      extraTimeSeconds: Math.max(0, attempt.durationGrantedSeconds - examMeta.durationSeconds),
      largerText: participant?.largerText ?? false,
    };
  }
}
