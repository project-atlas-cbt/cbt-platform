import type { Prisma } from '@atlas/db';
import type { AdjustableResultValues } from '@atlas/domain';
import type {
  ResultAdjustmentHistoryItemDto,
  ResultAdjustmentOperationResponseDto,
  ResultListItemDto,
} from './dto/result.dto.js';

/** Everything the staff results list and detail need in one query — the
 * student's identity, the class they sat the exam in, and the attempt's own
 * state and invalidation reason (ADR-0025 attaches the latter to a VOIDED
 * result rather than duplicating it onto the result row).
 *
 * P2-14: "the class they sat in" is the student's enrolment in the exam's
 * own academic session, whatever its status now — after rollover the
 * ACTIVE enrolment is next session's class, and past exams showed "—". */
export function resultListInclude(examAcademicSessionId: string) {
  return {
    studentProfile: {
      select: {
        id: true,
        studentId: true,
        membership: { select: { user: { select: { displayName: true } } } },
        enrollments: {
          where: { academicSessionId: examAcademicSessionId },
          orderBy: { startDate: 'desc' as const },
          select: { classGroupSession: { select: { id: true, name: true } } },
          take: 1,
        },
      },
    },
    attempt: {
      select: {
        id: true,
        state: true,
        submittedAt: true,
        invalidationReason: true,
        examSession: { select: { id: true } },
      },
    },
  } satisfies Prisma.ResultInclude;
}

export type ResultWithRelations = Prisma.ResultGetPayload<{
  include: ReturnType<typeof resultListInclude>;
}>;

/** Prisma returns `Decimal` for the percentage column. Converted once, here,
 * so no downstream caller has to remember that `percentage` is not already a
 * number — and so the wire format is a plain JSON number rather than
 * Decimal's object serialisation. */
export function decimalToNumber(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : value.toNumber();
}

export function toResultListItemDto(row: ResultWithRelations): ResultListItemDto {
  const enrollment = row.studentProfile.enrollments[0];
  return {
    id: row.id,
    attemptId: row.attemptId,
    studentProfileId: row.studentProfileId,
    studentName: row.studentProfile.membership.user.displayName,
    studentIdentifier: row.studentProfile.studentId,
    classId: enrollment?.classGroupSession.id ?? null,
    className: enrollment?.classGroupSession.name ?? null,
    state: row.state,
    totalMarks: row.totalMarks,
    earnedMarks: row.earnedMarks,
    percentage: decimalToNumber(row.percentage),
    correctCount: row.correctCount,
    incorrectCount: row.incorrectCount,
    unansweredCount: row.unansweredCount,
    partialCount: row.partialCount,
    grade: row.grade,
    withheld: row.withheld,
    withheldReason: row.withheldReason,
    // ADR-0025: "visible to authorized staff WITH the invalidation reason
    // attached." Surfaced only for a genuinely voided result — an ordinary
    // result must not carry a stray reason field.
    voidedReason: row.state === 'VOIDED' ? row.attempt.invalidationReason : null,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    submittedAt: row.attempt.submittedAt?.toISOString() ?? null,
    attemptState: row.attempt.state,
  };
}

export function toAdjustmentHistoryItemDto(row: {
  id: string;
  operationId: string;
  adjustmentType: ResultAdjustmentHistoryItemDto['adjustmentType'];
  reason: string;
  createdAt: Date;
  oldValue: Prisma.JsonValue;
  newValue: Prisma.JsonValue;
  authorizedByName: string;
}): ResultAdjustmentHistoryItemDto {
  return {
    id: row.id,
    operationId: row.operationId,
    adjustmentType: row.adjustmentType,
    reason: row.reason,
    authorizedByName: row.authorizedByName,
    createdAt: row.createdAt.toISOString(),
    oldValue: row.oldValue as unknown as Record<string, unknown>,
    newValue: row.newValue as unknown as Record<string, unknown>,
  };
}

export function toAdjustmentOperationDto(
  row: {
    id: string;
    examId: string;
    type: ResultAdjustmentOperationResponseDto['type'];
    status: ResultAdjustmentOperationResponseDto['status'];
    reason: string;
    totalCount: number;
    appliedCount: number;
    failedCount: number;
    failureReason: string | null;
    createdAt: Date;
    completedAt: Date | null;
  },
  createdByName: string,
): ResultAdjustmentOperationResponseDto {
  return {
    id: row.id,
    examId: row.examId,
    type: row.type,
    status: row.status,
    reason: row.reason,
    totalCount: row.totalCount,
    appliedCount: row.appliedCount,
    failedCount: row.failedCount,
    failureReason: row.failureReason,
    createdByName,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** The numeric snapshot written into `ResultAdjustment.oldValue`/`newValue`.
 * Kept as its own function so both the API-side single adjustment and the
 * worker-side bulk path serialise the identical shape — the replay guarantee
 * (DoD item 12) depends on every child row being readable the same way. */
export function toAdjustableValues(row: {
  totalMarks: number;
  earnedMarks: number;
  percentage: Prisma.Decimal | number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  partialCount: number;
}): AdjustableResultValues {
  return {
    totalMarks: row.totalMarks,
    earnedMarks: row.earnedMarks,
    percentage: decimalToNumber(row.percentage),
    correctCount: row.correctCount,
    incorrectCount: row.incorrectCount,
    unansweredCount: row.unansweredCount,
    partialCount: row.partialCount,
  };
}
