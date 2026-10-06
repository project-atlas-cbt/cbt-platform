import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import {
  effectiveResultSettings,
  type AttemptSnapshotDocumentV1,
  type ResultDetailVisibility,
} from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { loadSchoolResultSettings } from '../platform/school-result-settings.util.js';
import { decimalToNumber, gradePassing } from './result-mappers.js';
import { studentVisibleResultWhere } from './result-visibility.util.js';
import type {
  StudentResultDetailDto,
  StudentResultListItemDto,
  StudentResultsResponseDto,
} from './dto/student-result.dto.js';

/**
 * `student-results.v1` — 04 §60/§61, 05 §51: "Only published results."
 *
 * Every query in this service goes through `studentVisibleResultWhere`,
 * which is ADR-0010's three-condition rule expressed once as a Prisma
 * fragment. The student's own `studentProfileId` is resolved from their
 * session here and never accepted from the request, so "another student's
 * result" is not a case this service can be asked to consider — including by
 * URL manipulation, which the roadmap's P14 integration expectation names
 * explicitly.
 */
@Injectable()
export class StudentResultService {
  constructor(private readonly authz: AuthorizationService) {}

  async list(schoolId: string, actor: AuthorizedActor): Promise<StudentResultsResponseDto> {
    const studentProfileId = await this.requireOwnStudentProfile(schoolId, actor);

    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.result.findMany({
        where: studentVisibleResultWhere(schoolId, studentProfileId),
        include: {
          gradingScaleVersion: { select: { bands: { select: { label: true, isPassing: true } } } },
          exam: {
            select: {
              id: true,
              title: true,
              examType: true,
              subject: { select: { name: true } },
              resultPublication: { select: { publishedAt: true } },
            },
          },
        },
        orderBy: { finalizedAt: 'desc' },
      }),
    );

    return { items: rows.map((row) => this.toListItem(row)) };
  }

  async getDetail(
    schoolId: string,
    actor: AuthorizedActor,
    resultId: string,
  ): Promise<StudentResultDetailDto> {
    const studentProfileId = await this.requireOwnStudentProfile(schoolId, actor);

    // The visibility fragment is part of the WHERE, not a check applied
    // afterwards: a result that fails any of ADR-0010's conditions is simply
    // not found, so an unpublished, withheld, voided or someone else's
    // result all return the identical 404 and disclose nothing.
    const row = await withTenant(prisma, schoolId, (tx) =>
      tx.result.findFirst({
        where: { AND: [studentVisibleResultWhere(schoolId, studentProfileId), { id: resultId }] },
        include: {
          gradingScaleVersion: { select: { bands: { select: { label: true, isPassing: true } } } },
          exam: {
            select: {
              id: true,
              title: true,
              examType: true,
              resultPolicy: true,
              resultDetailVisibility: true,
              subject: { select: { name: true } },
              resultPublication: { select: { publishedAt: true } },
            },
          },
        },
      }),
    );
    if (!row) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Result not found.' });
    }

    // ADR-0010 (2026-10-06 amendment): a locked school's own setting wins
    // over the exam's stored copy.
    const visibility: ResultDetailVisibility = effectiveResultSettings(
      await loadSchoolResultSettings(schoolId),
      row.exam,
    ).resultDetailVisibility;
    const base = this.toListItem(row);

    const showCounts = visibility === 'SCORE_AND_COUNTS' || visibility === 'FULL_REVIEW';
    const questions =
      visibility === 'FULL_REVIEW'
        ? await this.loadQuestionReview(schoolId, row.exam.id, row.attemptId)
        : [];

    return {
      ...base,
      detailVisibility: visibility,
      correctCount: showCounts ? row.correctCount : null,
      incorrectCount: showCounts ? row.incorrectCount : null,
      unansweredCount: showCounts ? row.unansweredCount : null,
      questions,
    };
  }

  /**
   * `FULL_REVIEW` shows the student which questions they got right or wrong
   * and what each was worth — deliberately NOT which option was correct.
   * 04 §61 offers question review, not an answer key, and the snapshot's
   * `correctFlag` never leaves the server (the same X-05 boundary B13
   * established for the live attempt payload).
   */
  private async loadQuestionReview(
    schoolId: string,
    examId: string,
    attemptId: string,
  ): Promise<StudentResultDetailDto['questions']> {
    const [questionResults, snapshot, voids] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.attemptQuestionResult.findMany({ where: { schoolId, attemptId } }),
        tx.attemptQuestionSnapshot.findUnique({
          where: { schoolId_attemptId: { schoolId, attemptId } },
          select: { document: true },
        }),
        // P3-2: a voided question no longer counts towards the score, so the
        // review marks it rather than leaving marks that don't add up.
        tx.resultAdjustmentOperation.findMany({
          where: {
            schoolId,
            examId,
            type: 'VOID_QUESTION',
            status: 'COMPLETED',
            targetExamQuestionId: { not: null },
          },
          select: { targetExamQuestionId: true },
        }),
      ]),
    );
    const voided = new Set(voids.map((op) => op.targetExamQuestionId));

    const document = snapshot?.document as unknown as AttemptSnapshotDocumentV1 | undefined;
    const byId = new Map((document?.questions ?? []).map((q) => [q.examQuestionId, q] as const));

    return questionResults
      .map((qr) => {
        const question = byId.get(qr.examQuestionId);
        return {
          displaySequence: question?.displaySequence ?? 0,
          content: question?.content ?? '',
          correctness: qr.correctness,
          awardedMarks: qr.awardedMarks,
          maximumMarks: qr.maximumMarks,
          voided: voided.has(qr.examQuestionId),
        };
      })
      .sort((a, b) => a.displaySequence - b.displaySequence);
  }

  private toListItem(row: {
    id: string;
    totalMarks: number;
    earnedMarks: number;
    percentage: unknown;
    grade: string | null;
    gradingScaleVersion: { bands: { label: string; isPassing: boolean }[] } | null;
    exam: {
      id: string;
      title: string;
      examType: string | null;
      subject: { name: string };
      resultPublication: { publishedAt: Date | null } | null;
    };
  }): StudentResultListItemDto {
    return {
      id: row.id,
      examId: row.exam.id,
      examTitle: row.exam.title,
      subjectName: row.exam.subject.name,
      examType: row.exam.examType,
      totalMarks: row.totalMarks,
      earnedMarks: row.earnedMarks,
      percentage: decimalToNumber(row.percentage as never),
      // ADR-0018: the STORED grade, never recomputed from the school's
      // current scale — a later edit must not restate a past grade.
      grade: row.grade,
      gradePassing: gradePassing(row.grade, row.gradingScaleVersion),
      publishedAt: row.exam.resultPublication?.publishedAt?.toISOString() ?? null,
    };
  }

  private async requireOwnStudentProfile(
    schoolId: string,
    actor: AuthorizedActor,
  ): Promise<string> {
    const decision = await this.authz.evaluate(actor, 'results.viewExamResults', { schoolId });
    if (!decision.allowed || actor.kind !== 'SCHOOL') {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to view results.',
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
        message: 'Only a student may view their own results.',
      });
    }
    return profile.id;
  }
}
