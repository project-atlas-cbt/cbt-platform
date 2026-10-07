import { Injectable } from '@nestjs/common';
import { Prisma, prisma, withTenant } from '@atlas/db';
import { rollUpParticipation, type AttemptSnapshotDocumentV1 } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { resolveMembershipDisplayNames } from '../execution/exam-control-mappers.js';
import { loadExamOrThrow } from '../exams/exam-mappers.js';
import {
  resultListInclude,
  decimalToNumber,
  toAdjustmentHistoryItemDto,
  toResultListItemDto,
} from './result-mappers.js';
import { isExamCreator, resolveResultResourceContext } from './result-scope.util.js';
import { aggregatableResultWhere } from './result-visibility.util.js';
import type {
  ExamResultClassSummaryDto,
  ExamResultSummaryDto,
  ExamResultsResponseDto,
  ListExamResultsQueryDto,
  ResultDetailResponseDto,
  ResultQuestionBreakdownDto,
} from './dto/result.dto.js';

/**
 * `results.v1`'s read half — the staff results list (04 §48/§49) and the
 * individual result with its per-question breakdown and adjustment history.
 *
 * Scope is resolved through the EXAM, never the result: `02`'s Results rows
 * grade exactly like the exam that produced them, so a teacher sees their
 * own exams' results, an HOD their department's, School Admin/Moderator the
 * school's. See `result-scope.util.ts` for why that resolution mirrors
 * `ExamService`'s rather than inventing a second scheme.
 */
@Injectable()
export class ResultQueryService {
  constructor(private readonly authz: AuthorizationService) {}

  async listForExam(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    query: ListExamResultsQueryDto,
  ): Promise<ExamResultsResponseDto> {
    const exam = await loadExamOrThrow(schoolId, examId);
    await this.assertCanViewExamResults(schoolId, actor, exam);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortBy = query.sortBy ?? 'studentName';
    const sortDir = query.sortDir ?? 'asc';

    // P2-13: the class filter and the search both narrow the student, so
    // they are ANDed; spread into one object, the search replaced the class.
    // P2-14: a class id belongs to one session, so the enrolment's current
    // status is irrelevant — a rolled-over student still sat in that class.
    const q = query.q?.trim();
    const where: Prisma.ResultWhereInput = {
      schoolId,
      examId,
      ...(query.state !== undefined && { state: query.state }),
      AND: [
        ...(query.classId !== undefined
          ? [
              {
                studentProfile: {
                  enrollments: { some: { schoolId, classId: query.classId } },
                },
              },
            ]
          : []),
        ...(q
          ? [
              {
                studentProfile: {
                  OR: [
                    { studentId: { contains: q, mode: 'insensitive' as const } },
                    {
                      membership: {
                        user: { displayName: { contains: q, mode: 'insensitive' as const } },
                      },
                    },
                  ],
                },
              },
            ]
          : []),
      ],
    };

    // P2-15: tied percentages are common; `id` makes the order total so
    // pages never repeat or skip a student.
    const primaryOrder: Prisma.ResultOrderByWithRelationInput =
      sortBy === 'studentName'
        ? { studentProfile: { membership: { user: { displayName: sortDir } } } }
        : sortBy === 'percentage'
          ? { percentage: sortDir }
          : sortBy === 'earnedMarks'
            ? { earnedMarks: sortDir }
            : { finalizedAt: sortDir };

    const [rows, total] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.result.findMany({
          where,
          include: resultListInclude(exam.academicSessionId),
          orderBy: [primaryOrder, { id: sortDir }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.result.count({ where }),
      ]),
    );

    const publication = await withTenant(prisma, schoolId, (tx) =>
      tx.resultPublication.findUnique({ where: { schoolId_examId: { schoolId, examId } } }),
    );

    return {
      items: rows.map(toResultListItemDto),
      total,
      page,
      pageSize,
      summary: await this.computeSummary(schoolId, examId),
      classSummaries: await this.computeClassSummaries(schoolId, exam),
      published: publication?.status === 'PUBLISHED',
      adjustmentInProgress: publication?.adjustmentInProgress ?? false,
    };
  }

  async getDetail(
    schoolId: string,
    actor: AuthorizedActor,
    resultId: string,
  ): Promise<ResultDetailResponseDto> {
    const result = await withTenant(prisma, schoolId, async (tx) => {
      const sessionOf = await tx.result.findUnique({
        where: { id: resultId },
        select: { exam: { select: { academicSessionId: true } } },
      });
      if (!sessionOf) return null;
      return tx.result.findUnique({
        where: { id: resultId },
        include: {
          ...resultListInclude(sessionOf.exam.academicSessionId),
          exam: { select: { id: true, title: true, subject: { select: { name: true } } } },
          adjustments: {
            orderBy: { createdAt: 'asc' },
            include: {
              operation: { select: { targetExamQuestionId: true, type: true } },
            },
          },
        },
      });
    });
    if (!result) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Result not found.' });
    }

    const exam = await loadExamOrThrow(schoolId, result.examId);
    await this.assertCanViewExamResults(schoolId, actor, exam, 'results.viewIndividualResult');

    const [questionResults, snapshot, actorNames] = await Promise.all([
      withTenant(prisma, schoolId, (tx) =>
        tx.attemptQuestionResult.findMany({
          where: { schoolId, attemptId: result.attemptId },
        }),
      ),
      withTenant(prisma, schoolId, (tx) =>
        tx.attemptQuestionSnapshot.findUnique({
          where: { schoolId_attemptId: { schoolId, attemptId: result.attemptId } },
          select: { document: true },
        }),
      ),
      resolveMembershipDisplayNames(
        schoolId,
        result.adjustments.map((a) => a.authorizedByMembershipId),
      ),
    ]);

    // Questions voided by an adjustment stay in the breakdown, flagged —
    // 07 §38 keeps the marking evidence immutable, so the honest view is
    // "this question was asked and then excluded", never a silently
    // shortened paper.
    const voidedQuestionIds = new Set(
      result.adjustments
        .filter((a) => a.adjustmentType === 'VOID_QUESTION')
        .map((a) => a.operation.targetExamQuestionId)
        .filter((id): id is string => id !== null),
    );

    const document = snapshot?.document as unknown as AttemptSnapshotDocumentV1 | undefined;
    const questionsById = new Map(
      (document?.questions ?? []).map((q) => [q.examQuestionId, q] as const),
    );

    const questions: ResultQuestionBreakdownDto[] = questionResults
      .map((qr) => {
        const snapshotQuestion = questionsById.get(qr.examQuestionId);
        return {
          examQuestionId: qr.examQuestionId,
          displaySequence: snapshotQuestion?.displaySequence ?? 0,
          content: snapshotQuestion?.content ?? '',
          correctness: qr.correctness,
          awardedMarks: qr.awardedMarks,
          maximumMarks: qr.maximumMarks,
          voided: voidedQuestionIds.has(qr.examQuestionId),
        };
      })
      .sort((a, b) => a.displaySequence - b.displaySequence);

    return {
      ...toResultListItemDto(result),
      examId: result.examId,
      examTitle: result.exam.title,
      subjectName: result.exam.subject.name,
      gradingScaleVersionId: result.gradingScaleVersionId,
      questions,
      adjustments: result.adjustments.map((a) =>
        toAdjustmentHistoryItemDto({
          ...a,
          authorizedByName: actorNames.get(a.authorizedByMembershipId) ?? 'Unknown',
        }),
      ),
    };
  }

  /**
   * 04 §48's exam header block. Every figure runs through
   * `aggregatableResultWhere`, which is ADR-0025's shared filter — VOIDED
   * results are counted separately and excluded from every average.
   */
  async computeSummary(schoolId: string, examId: string): Promise<ExamResultSummaryDto> {
    return this.summaryFor(schoolId, aggregatableResultWhere(schoolId, examId), examId);
  }

  private async summaryFor(
    schoolId: string,
    where: Prisma.ResultWhereInput,
    examId: string,
    extraWhere?: Prisma.ResultWhereInput,
    classId?: string,
  ): Promise<ExamResultSummaryDto> {
    const scoped: Prisma.ResultWhereInput = extraWhere ? { AND: [where, extraWhere] } : where;
    const classStudentFilter: Prisma.StudentProfileWhereInput | undefined =
      classId === undefined
        ? undefined
        : {
            enrollments: { some: { schoolId, classId } },
          };
    const participantWhere: Prisma.ExamSessionParticipantWhereInput = {
      schoolId,
      session: { examId },
      ...(classStudentFilter !== undefined && { studentProfile: classStudentFilter }),
    };
    const participationWhere: Prisma.ExamParticipationWhereInput = {
      schoolId,
      examId,
      ...(classStudentFilter !== undefined && { studentProfile: classStudentFilter }),
    };
    const attemptWhere: Prisma.ExamAttemptWhereInput = {
      schoolId,
      examId,
      ...(classStudentFilter !== undefined && { studentProfile: classStudentFilter }),
    };

    const [
      aggregate,
      voidedCount,
      pendingCount,
      passingRows,
      participants,
      participations,
      attempts,
    ] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.result.aggregate({
          where: scoped,
          _count: { _all: true },
          _avg: { percentage: true },
          _max: { percentage: true },
          _min: { percentage: true },
        }),
        tx.result.count({
          where: { ...(extraWhere ?? {}), schoolId, examId, state: 'VOIDED' },
        }),
        tx.result.count({
          where: { ...(extraWhere ?? {}), schoolId, examId, state: 'PROCESSING' },
        }),
        // Pass rate derives from the STORED grade's band (B15's confirmed
        // `isPassing` decision), never from a hard-coded percentage — so a
        // school that grades on its own scale gets its own pass rule, and a
        // school with no scale at all gets `null` rather than an invented
        // threshold.
        tx.result.findMany({
          where: { AND: [scoped, { grade: { not: null } }] },
          select: { grade: true, gradingScaleVersionId: true },
        }),
        tx.examSessionParticipant.findMany({
          where: participantWhere,
          select: { studentProfileId: true, examSessionId: true },
        }),
        tx.examParticipation.findMany({
          where: participationWhere,
          select: { studentProfileId: true, examSessionId: true, status: true },
        }),
        tx.examAttempt.findMany({
          where: attemptWhere,
          select: { studentProfileId: true, examSessionId: true, state: true },
        }),
      ]),
    );

    const resultCount = aggregate._count._all;
    const participantIds = new Set(participants.map((participant) => participant.studentProfileId));
    const absentCount = [...participantIds].filter(
      (studentProfileId) =>
        rollUpParticipation(
          participants
            .filter((participant) => participant.studentProfileId === studentProfileId)
            .map((participant) => ({
              status:
                participations.find(
                  (entry) =>
                    entry.studentProfileId === studentProfileId &&
                    entry.examSessionId === participant.examSessionId,
                )?.status ?? null,
              hasNonInvalidatedAttempt: attempts.some(
                (attempt) =>
                  attempt.studentProfileId === studentProfileId &&
                  attempt.examSessionId === participant.examSessionId &&
                  attempt.state !== 'INVALIDATED' &&
                  attempt.state !== 'CANCELLED',
              ),
            })),
        ) === 'ABSENT',
    ).length;
    const passRate = await this.computePassRate(schoolId, passingRows);

    return {
      expectedStudentCount: participantIds.size,
      absentCount,
      resultCount,
      voidedCount,
      pendingCount,
      averagePercentage:
        aggregate._avg.percentage === null
          ? null
          : Math.round(decimalToNumber(aggregate._avg.percentage) * 100) / 100,
      highestPercentage:
        aggregate._max.percentage === null ? null : decimalToNumber(aggregate._max.percentage),
      lowestPercentage:
        aggregate._min.percentage === null ? null : decimalToNumber(aggregate._min.percentage),
      passRate,
      // P2-21: finalised before the school had grading bands; "Grade now"
      // grades exactly these.
      ungradedCount: resultCount - passingRows.length,
    };
  }

  private async computePassRate(
    schoolId: string,
    rows: { grade: string | null; gradingScaleVersionId: string | null }[],
  ): Promise<number | null> {
    if (rows.length === 0) return null;

    const versionIds = [
      ...new Set(rows.map((r) => r.gradingScaleVersionId).filter((id): id is string => !!id)),
    ];
    if (versionIds.length === 0) return null;

    const bands = await withTenant(prisma, schoolId, (tx) =>
      tx.gradingScaleBand.findMany({
        where: { schoolId, versionId: { in: versionIds } },
        select: { versionId: true, label: true, isPassing: true },
      }),
    );

    const passingByVersion = new Map<string, Set<string>>();
    for (const band of bands) {
      if (!band.isPassing) continue;
      const set = passingByVersion.get(band.versionId) ?? new Set<string>();
      set.add(band.label);
      passingByVersion.set(band.versionId, set);
    }
    if (passingByVersion.size === 0) return null;

    const passed = rows.filter(
      (r) =>
        r.gradingScaleVersionId !== null &&
        r.grade !== null &&
        passingByVersion.get(r.gradingScaleVersionId)?.has(r.grade) === true,
    ).length;

    return Math.round((passed / rows.length) * 10000) / 100;
  }

  /**
   * ADR-0013: "results and analytics aggregate across the exam WITH per-class
   * breakdown available." An exam may target several arms of the same level,
   * so the whole-exam average alone hides a class that did markedly worse.
   */
  private async computeClassSummaries(
    schoolId: string,
    exam: {
      id: string;
      classes: { classSubject: { classGroupSession: { id: string; name: string } } }[];
    },
  ): Promise<ExamResultClassSummaryDto[]> {
    const classes = exam.classes.map((c) => c.classSubject.classGroupSession);
    if (classes.length <= 1) return [];

    return Promise.all(
      classes.map(async (classGroup) => ({
        classId: classGroup.id,
        className: classGroup.name,
        ...(await this.summaryFor(
          schoolId,
          aggregatableResultWhere(schoolId, exam.id),
          exam.id,
          {
            studentProfile: {
              enrollments: { some: { schoolId, classId: classGroup.id } },
            },
          },
          classGroup.id,
        )),
      })),
    );
  }

  /**
   * Shared gate for every staff-side read. A caller outside scope gets
   * `NOT_FOUND`, not `FORBIDDEN`: an exam's existence within another
   * department is not information this actor is entitled to, and
   * `ExamService` already established this response for the same reason.
   */
  private async assertCanViewExamResults(
    schoolId: string,
    actor: AuthorizedActor,
    exam: Parameters<typeof resolveResultResourceContext>[2] & { id: string },
    permissionId:
      'results.viewExamResults' | 'results.viewIndividualResult' = 'results.viewExamResults',
  ): Promise<void> {
    const resource = await resolveResultResourceContext(schoolId, actor, exam);
    const decision = await this.authz.evaluate(actor, permissionId, resource);
    if (!decision.allowed && !isExamCreator(actor, exam)) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Result not found.' });
    }
  }
}
