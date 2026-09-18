import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import { rollUpParticipation } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import {
  aggregatableResultWhere,
  studentVisibleResultWhere,
} from '../results/result-visibility.util.js';
import { resolveResultResourceContext, isExamCreator } from '../results/result-scope.util.js';
import { loadExamOrThrow } from '../exams/exam-mappers.js';
import {
  distribution,
  frozenPassRate,
  rate,
  round,
  summarizePercentages,
} from './analytics-metrics.util.js';
import type {
  AnalyticsTrendDto,
  AnalyticsContextQueryDto,
  ClassAnalyticsQueryDto,
  ClassAnalyticsResponseDto,
  DepartmentAnalyticsResponseDto,
  ExamAnalyticsResponseDto,
  ParticipationMetricDto,
  PercentageMetricDto,
  QuestionAnalyticsResponseDto,
  SchoolAnalyticsResponseDto,
  StudentAnalyticsResponseDto,
} from './dto/analytics.dto.js';

type ResultRow = {
  percentage: Prisma.Decimal;
  grade: string | null;
  gradingScaleVersionId: string | null;
};

/**
 * B17's read model. It owns no academic facts: all figures below are rebuilt
 * from Results, AttemptQuestionResult, ExamAttempt and ExamParticipation on
 * demand. Cache refresh/invalidation may optimize this service, but must never
 * become a second authority.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly authz: AuthorizationService) {}

  async exam(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
  ): Promise<ExamAnalyticsResponseDto> {
    const exam = await this.authorizeExam(schoolId, actor, examId, 'analytics.examCompletionStats');
    const base = await this.metricsFor(schoolId, { examId });
    const results = await this.resultsFor(schoolId, { examId });
    const [participation, voidedResultCount] = await Promise.all([
      this.participationFor(schoolId, { examId }),
      withTenant(prisma, schoolId, (tx) =>
        tx.result.count({ where: { schoolId, examId, state: 'VOIDED' } }),
      ),
    ]);
    const classes = exam.classes.map((entry) => entry.classSubject.classGroupSession);
    const classBreakdown = await Promise.all(
      classes.map(async (classGroup) => ({
        classId: classGroup.id,
        className: classGroup.name,
        ...(await this.metricsFor(schoolId, { examId, classId: classGroup.id })),
        participation: await this.participationFor(schoolId, { examId, classId: classGroup.id }),
      })),
    );
    return {
      examId,
      ...base,
      voidedResultCount,
      participation,
      distribution: distribution(results.map((row) => Number(row.percentage))),
      classBreakdown,
    };
  }

  async questions(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
  ): Promise<QuestionAnalyticsResponseDto> {
    await this.authorizeExam(schoolId, actor, examId, 'analytics.questionDifficulty');
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.examQuestion.findMany({
        where: { schoolId, examId },
        orderBy: { sequence: 'asc' },
        include: {
          revision: { include: { question: true, topic: true } },
        },
      }),
    );
    const resultRows = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptQuestionResult.findMany({
        where: {
          schoolId,
          attempt: { result: { is: aggregatableResultWhere(schoolId, examId) } },
        },
        select: { examQuestionId: true, correctness: true },
      }),
    );
    const voided = await withTenant(prisma, schoolId, (tx) =>
      tx.resultAdjustmentOperation.findMany({
        where: { schoolId, examId, type: 'VOID_QUESTION', status: 'COMPLETED' },
        select: { targetExamQuestionId: true },
      }),
    );
    const voidedIds = new Set(voided.map((entry) => entry.targetExamQuestionId).filter(Boolean));
    return {
      examId,
      items: rows.map((question) => {
        const facts = resultRows.filter((entry) => entry.examQuestionId === question.id);
        const correctCount = facts.filter((entry) => entry.correctness === 'CORRECT').length;
        const unansweredCount = facts.filter((entry) => entry.correctness === 'UNANSWERED').length;
        const incorrectCount = facts.length - correctCount - unansweredCount;
        const denominator = facts.length;
        return {
          examQuestionId: question.id,
          sequence: question.sequence,
          questionId: question.revision.questionId,
          questionType: question.revision.questionType,
          subjectId: question.revision.question.subjectId,
          topicName: question.revision.topic?.name ?? null,
          exposureCount: denominator,
          correctCount,
          incorrectCount,
          unansweredCount,
          correctRate: rate(correctCount, denominator),
          incorrectRate: rate(incorrectCount, denominator),
          unansweredRate: rate(unansweredCount, denominator),
          voidedForScoring: voidedIds.has(question.id),
        };
      }),
    };
  }

  async class(
    schoolId: string,
    actor: AuthorizedActor,
    classId: string,
    query: ClassAnalyticsQueryDto,
  ): Promise<ClassAnalyticsResponseDto> {
    const { subjects } = await this.authorizeClass(schoolId, actor, classId, query);
    const examWhere = this.examWhere(schoolId, { classId, ...query });
    const exams = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.findMany({ where: examWhere, select: { id: true, title: true, subjectId: true } }),
    );
    const examIds = exams.map((exam) => exam.id);
    const metrics = await this.metricsFor(schoolId, { examIds, classId });
    const participation = await this.participationFor(schoolId, { examIds, classId });
    return {
      classId,
      ...metrics,
      participation,
      subjects: await Promise.all(
        subjects.map(async (subject) => ({
          id: subject.subjectId,
          name: subject.subject.name,
          ...(await this.metricsFor(schoolId, { examIds, classId, subjectId: subject.subjectId })),
        })),
      ),
      exams: await Promise.all(
        exams.map(async (exam) => ({
          id: exam.id,
          name: exam.title,
          ...(await this.metricsFor(schoolId, { examId: exam.id, classId })),
        })),
      ),
    };
  }

  async department(
    schoolId: string,
    actor: AuthorizedActor,
    departmentId: string,
    query: AnalyticsContextQueryDto,
  ): Promise<DepartmentAnalyticsResponseDto> {
    await this.authorizeDepartment(schoolId, actor, departmentId, query);
    const subjects = await withTenant(prisma, schoolId, (tx) =>
      tx.subject.findMany({
        where: { schoolId, departmentId, ...(query.subjectId && { id: query.subjectId }) },
        select: { id: true, name: true },
      }),
    );
    const exams = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.findMany({
        where: {
          schoolId,
          departmentId,
          ...(query.subjectId && { subjectId: query.subjectId }),
          ...(query.academicSessionId && { academicSessionId: query.academicSessionId }),
          ...(query.academicTermId && { academicTermId: query.academicTermId }),
        },
        select: { id: true, title: true },
      }),
    );
    const examIds = exams.map((exam) => exam.id);
    const classRows = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findMany({
        where: {
          schoolId,
          departmentId,
          ...(query.academicSessionId && { academicSessionId: query.academicSessionId }),
        },
        select: { id: true, name: true },
      }),
    );
    const terms = await withTenant(prisma, schoolId, (tx) =>
      tx.academicTerm.findMany({
        where: {
          schoolId,
          ...(query.academicSessionId && { academicSessionId: query.academicSessionId }),
          ...(query.academicTermId && { id: query.academicTermId }),
        },
        select: { id: true, name: true },
      }),
    );
    return {
      departmentId,
      ...(await this.metricsFor(schoolId, { examIds })),
      subjects: await Promise.all(
        subjects.map(async (subject) => ({
          id: subject.id,
          name: subject.name,
          ...(await this.metricsFor(schoolId, { examIds, subjectId: subject.id })),
        })),
      ),
      classes: await Promise.all(
        classRows.map(async (item) => ({
          id: item.id,
          name: item.name,
          ...(await this.metricsFor(schoolId, { examIds, classId: item.id })),
        })),
      ),
      exams: await Promise.all(
        exams.map(async (exam) => ({
          id: exam.id,
          name: exam.title,
          ...(await this.metricsFor(schoolId, { examId: exam.id })),
        })),
      ),
      termTrends: await Promise.all(
        terms.map((term) =>
          this.trendFor(schoolId, term.id, term.name, {
            departmentId,
            ...(query.subjectId && { subjectId: query.subjectId }),
            academicTermId: term.id,
          }),
        ),
      ),
    };
  }

  async school(
    schoolId: string,
    actor: AuthorizedActor,
    query: AnalyticsContextQueryDto,
  ): Promise<SchoolAnalyticsResponseDto> {
    await this.authorizeSchool(schoolId, actor, query);
    const exams = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.findMany({
        where: {
          schoolId,
          ...(query.subjectId && { subjectId: query.subjectId }),
          ...(query.academicSessionId && { academicSessionId: query.academicSessionId }),
          ...(query.academicTermId && { academicTermId: query.academicTermId }),
        },
        select: { id: true },
      }),
    );
    const examIds = exams.map((entry) => entry.id);
    const departments = await withTenant(prisma, schoolId, (tx) =>
      tx.department.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    );
    const sessions = await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.findMany({
        where: {
          schoolId,
          ...(query.academicSessionId && { id: query.academicSessionId }),
          ...(query.academicTermId && { terms: { some: { id: query.academicTermId } } }),
        },
        select: { id: true, name: true },
      }),
    );
    return {
      ...(await this.metricsFor(schoolId, { examIds })),
      participation: await this.participationFor(schoolId, { examIds }),
      examCount: examIds.length,
      attemptCount: await withTenant(prisma, schoolId, (tx) =>
        tx.examAttempt.count({ where: { schoolId, examId: { in: examIds } } }),
      ),
      departments: await Promise.all(
        departments.map(async (department) => ({
          id: department.id,
          name: department.name,
          ...(await this.metricsFor(schoolId, { examIds, departmentId: department.id })),
        })),
      ),
      sessionTrends: await Promise.all(
        sessions.map((session) =>
          this.trendFor(schoolId, session.id, session.name, {
            ...(query.subjectId && { subjectId: query.subjectId }),
            academicSessionId: session.id,
          }),
        ),
      ),
    };
  }

  async student(
    schoolId: string,
    actor: AuthorizedActor,
    studentProfileId: string,
    query: AnalyticsContextQueryDto = {},
  ): Promise<StudentAnalyticsResponseDto> {
    await this.assertContext(schoolId, query);
    const student = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findUnique({
        where: { schoolId_id: { schoolId, id: studentProfileId } },
        select: { membership: { select: { userId: true } } },
      }),
    );
    if (!student) throw new AppHttpException({ code: 'NOT_FOUND', message: 'Student not found.' });
    const own = actor.kind === 'SCHOOL' && actor.userId === student.membership.userId;
    const where: Prisma.ResultWhereInput = own
      ? {
          AND: [
            studentVisibleResultWhere(schoolId, studentProfileId),
            { exam: this.examWhere(schoolId, query) },
          ],
        }
      : {
          ...aggregatableResultWhere(schoolId),
          studentProfileId,
          exam: this.examWhere(schoolId, query),
        };
    const unfiltered = await withTenant(prisma, schoolId, (tx) =>
      tx.result.findMany({
        where,
        include: { exam: { include: { subject: true, classes: true } } },
        orderBy: { finalizedAt: 'desc' },
      }),
    );
    // A broad route-level grant is intentionally only the first gate. For a
    // staff history request every result is rechecked against its own exam
    // resource, so a Teacher's assigned class/subject or an HOD's department
    // cannot leak through an otherwise school-scoped student id.
    const rows = own
      ? unfiltered
      : (
          await Promise.all(
            unfiltered.map(async (row) => {
              const resource = await resolveResultResourceContext(schoolId, actor, row.exam);
              const decision = await this.authz.evaluate(actor, 'analytics.studentHistory', {
                ...resource,
                examId: row.examId,
              });
              return decision.allowed || isExamCreator(actor, row.exam) ? row : null;
            }),
          )
        ).filter((row): row is (typeof unfiltered)[number] => row !== null);
    return {
      studentProfileId,
      ...(await this.metricRows(schoolId, rows)),
      history: rows.map((row) => ({
        examId: row.examId,
        examTitle: row.exam.title,
        subjectName: row.exam.subject.name,
        percentage: Number(row.percentage),
        grade: row.grade,
        finalizedAt: row.finalizedAt?.toISOString() ?? null,
      })),
    };
  }

  /** These preflight checks run before every cached response. The service
   * methods repeat them on cache misses so direct callers are equally safe. */
  async authorizeExam(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    permission: string,
  ) {
    const exam = await loadExamOrThrow(schoolId, examId);
    await this.assertExamScope(schoolId, actor, exam, permission);
    return exam;
  }

  async authorizeClass(
    schoolId: string,
    actor: AuthorizedActor,
    classId: string,
    query: ClassAnalyticsQueryDto,
  ) {
    const classGroup = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findFirst({ where: { schoolId, id: classId } }),
    );
    if (!classGroup) throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
    await this.assertContext(schoolId, query);
    const subjects = await withTenant(prisma, schoolId, (tx) =>
      tx.classSubject.findMany({
        where: { schoolId, classId, ...(query.subjectId && { subjectId: query.subjectId }) },
        include: { subject: true },
      }),
    );
    const teacherOnly =
      actor.kind === 'SCHOOL' &&
      actor.roles.includes('TEACHER') &&
      !actor.roles.some(
        (role) => role === 'HOD' || role === 'SCHOOL_ADMIN' || role === 'MODERATOR',
      );
    if (teacherOnly && !query.subjectId)
      throw new AppHttpException({
        code: 'VALIDATION_FAILED',
        message: 'subjectId is required for Teacher class analytics.',
      });
    const classSubject = subjects[0];
    const decision = await this.authz.evaluate(actor, 'analytics.class', {
      schoolId,
      ...(classGroup.departmentId && { departmentId: classGroup.departmentId }),
      ...(classSubject && { classSubjectId: classSubject.id }),
    });
    if (!decision.allowed)
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
    if (query.subjectId && subjects.length === 0)
      throw new AppHttpException({
        code: 'VALIDATION_FAILED',
        message: 'Subject is not assigned to this class.',
      });
    return { classGroup, subjects };
  }

  async authorizeDepartment(
    schoolId: string,
    actor: AuthorizedActor,
    departmentId: string,
    query: AnalyticsContextQueryDto,
  ): Promise<void> {
    const department = await withTenant(prisma, schoolId, (tx) =>
      tx.department.findFirst({ where: { schoolId, id: departmentId }, select: { id: true } }),
    );
    if (!department)
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Department not found.' });
    await this.assertContext(schoolId, query);
    if (query.subjectId) {
      const subject = await withTenant(prisma, schoolId, (tx) =>
        tx.subject.findFirst({
          where: { schoolId, id: query.subjectId!, departmentId },
          select: { id: true },
        }),
      );
      if (!subject)
        throw new AppHttpException({
          code: 'VALIDATION_FAILED',
          message: 'Subject is not in this department.',
        });
    }
    await this.assert(actor, 'analytics.department', { schoolId, departmentId });
  }

  async authorizeSchool(
    schoolId: string,
    actor: AuthorizedActor,
    query: AnalyticsContextQueryDto,
  ): Promise<void> {
    await this.assertContext(schoolId, query);
    if (query.subjectId) {
      const subject = await withTenant(prisma, schoolId, (tx) =>
        tx.subject.findFirst({ where: { schoolId, id: query.subjectId! }, select: { id: true } }),
      );
      if (!subject)
        throw new AppHttpException({ code: 'VALIDATION_FAILED', message: 'Subject not found.' });
    }
    await this.assert(actor, 'analytics.schoolWide', { schoolId });
  }

  async authorizeStudent(
    schoolId: string,
    actor: AuthorizedActor,
    studentProfileId: string,
    query: AnalyticsContextQueryDto,
  ): Promise<void> {
    await this.assertContext(schoolId, query);
    const student = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findUnique({
        where: { schoolId_id: { schoolId, id: studentProfileId } },
        select: { membership: { select: { userId: true } } },
      }),
    );
    if (!student) throw new AppHttpException({ code: 'NOT_FOUND', message: 'Student not found.' });
    if (actor.kind === 'SCHOOL' && actor.userId === student.membership.userId) return;
    const history = await this.student(schoolId, actor, studentProfileId, query);
    if (history.history.length === 0)
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Student not found.' });
  }

  /** Platform data is business/usage intelligence only. FORCE RLS means
   * school-owned facts are counted one tenant at a time, never with an
   * unscoped cross-school query. The worker cache added around this method is
   * an optimization; this deterministic source remains the authority. */
  async platform() {
    const schools = await prisma.school.findMany({ select: { id: true, status: true } });
    const totals = {
      students: 0,
      teachers: 0,
      exams: 0,
      attempts: 0,
      activations: 0,
      pendingSubscriptions: 0,
      activeSubscriptions: 0,
      expiringSubscriptions: 0,
      expiredSubscriptions: 0,
    };
    const trends = new Map<
      string,
      { month: string; schoolsCreated: number; examsCreated: number; attemptsStarted: number }
    >();
    const addTrend = (date: Date, field: 'schoolsCreated' | 'examsCreated' | 'attemptsStarted') => {
      const month = date.toISOString().slice(0, 7);
      const current = trends.get(month) ?? {
        month,
        schoolsCreated: 0,
        examsCreated: 0,
        attemptsStarted: 0,
      };
      current[field] += 1;
      trends.set(month, current);
    };
    for (const school of schools) {
      const counts = await withTenant(prisma, school.id, (tx) =>
        Promise.all([
          tx.roleAssignment.count({
            where: { schoolId: school.id, role: 'STUDENT', status: 'ACTIVE' },
          }),
          tx.roleAssignment.count({
            where: { schoolId: school.id, role: 'TEACHER', status: 'ACTIVE' },
          }),
          tx.exam.count({ where: { schoolId: school.id } }),
          tx.examAttempt.count({ where: { schoolId: school.id } }),
          tx.activationGrant.count({ where: { schoolId: school.id, activatedAt: { not: null } } }),
          tx.subscription.groupBy({
            by: ['status'],
            where: { schoolId: school.id },
            _count: { _all: true },
          }),
          tx.exam.findMany({ where: { schoolId: school.id }, select: { createdAt: true } }),
          tx.examAttempt.findMany({ where: { schoolId: school.id }, select: { startedAt: true } }),
        ]),
      );
      totals.students += counts[0];
      totals.teachers += counts[1];
      totals.exams += counts[2];
      totals.attempts += counts[3];
      totals.activations += counts[4];
      for (const state of counts[5]) {
        if (state.status === 'PENDING') totals.pendingSubscriptions += state._count._all;
        if (state.status === 'ACTIVE') totals.activeSubscriptions += state._count._all;
        if (state.status === 'EXPIRING') totals.expiringSubscriptions += state._count._all;
        if (state.status === 'EXPIRED') totals.expiredSubscriptions += state._count._all;
      }
      for (const exam of counts[6]) addTrend(exam.createdAt, 'examsCreated');
      for (const attempt of counts[7]) addTrend(attempt.startedAt, 'attemptsStarted');
    }
    const schoolDates = await prisma.school.findMany({ select: { createdAt: true } });
    for (const school of schoolDates) addTrend(school.createdAt, 'schoolsCreated');
    const countStatus = (status: string) =>
      schools.filter((school) => school.status === status).length;
    return {
      totalSchools: schools.length,
      activeSchools: countStatus('ACTIVE'),
      provisionalSchools: countStatus('PROVISIONAL'),
      suspendedSchools: countStatus('SUSPENDED'),
      expiredSchools: countStatus('EXPIRED'),
      deactivatedSchools: countStatus('DEACTIVATED'),
      ...totals,
      trends: [...trends.values()].sort((a, b) => a.month.localeCompare(b.month)),
      computedAt: new Date().toISOString(),
    };
  }

  private async assertExamScope(
    schoolId: string,
    actor: AuthorizedActor,
    exam: Parameters<typeof resolveResultResourceContext>[2] & { id: string },
    permission: string,
  ): Promise<void> {
    const resource = await resolveResultResourceContext(schoolId, actor, exam);
    const decision = await this.authz.evaluate(actor, permission, { ...resource, examId: exam.id });
    if (!decision.allowed && !isExamCreator(actor, exam))
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Exam not found.' });
  }

  private async assert(
    actor: AuthorizedActor,
    permission: string,
    resource: { schoolId: string; departmentId?: string; classSubjectId?: string },
  ): Promise<void> {
    const decision = await this.authz.evaluate(actor, permission, resource);
    if (!decision.allowed)
      throw new AppHttpException({
        code: decision.outcome === 'NOT_FOUND' ? 'NOT_FOUND' : 'FORBIDDEN',
        message: 'Analytics are not available for this resource.',
      });
  }

  private async assertContext(schoolId: string, query: AnalyticsContextQueryDto): Promise<void> {
    if (!query.academicSessionId && !query.academicTermId) return;
    const term = query.academicTermId
      ? await withTenant(prisma, schoolId, (tx) =>
          tx.academicTerm.findUnique({
            where: { schoolId_id: { schoolId, id: query.academicTermId! } },
          }),
        )
      : null;
    if (
      (query.academicTermId && !term) ||
      (query.academicSessionId &&
        !(await withTenant(prisma, schoolId, (tx) =>
          tx.academicSession.findUnique({
            where: { schoolId_id: { schoolId, id: query.academicSessionId! } },
          }),
        ))) ||
      (term && query.academicSessionId && term.academicSessionId !== query.academicSessionId)
    )
      throw new AppHttpException({
        code: 'VALIDATION_FAILED',
        message: 'Invalid academic context.',
      });
  }

  private examWhere(
    schoolId: string,
    filter: {
      classId?: string;
      subjectId?: string;
      departmentId?: string;
      academicSessionId?: string;
      academicTermId?: string;
    },
  ): Prisma.ExamWhereInput {
    return {
      schoolId,
      ...(filter.subjectId && { subjectId: filter.subjectId }),
      ...(filter.departmentId && { departmentId: filter.departmentId }),
      ...(filter.academicSessionId && { academicSessionId: filter.academicSessionId }),
      ...(filter.academicTermId && { academicTermId: filter.academicTermId }),
      ...(filter.classId && { classes: { some: { classSubject: { classId: filter.classId } } } }),
    };
  }

  private async resultsFor(
    schoolId: string,
    filter: {
      examId?: string;
      examIds?: string[];
      classId?: string;
      subjectId?: string;
      departmentId?: string;
    },
  ): Promise<ResultRow[]> {
    const where: Prisma.ResultWhereInput = {
      ...aggregatableResultWhere(schoolId),
      ...(filter.examId && { examId: filter.examId }),
      ...(filter.examIds && { examId: { in: filter.examIds } }),
      ...(filter.classId && {
        studentProfile: { enrollments: { some: { schoolId, classId: filter.classId } } },
      }),
      ...(filter.subjectId || filter.departmentId
        ? {
            exam: {
              ...(filter.subjectId && { subjectId: filter.subjectId }),
              ...(filter.departmentId && { departmentId: filter.departmentId }),
            },
          }
        : {}),
    };
    return withTenant(prisma, schoolId, (tx) =>
      tx.result.findMany({
        where,
        select: { percentage: true, grade: true, gradingScaleVersionId: true },
      }),
    );
  }

  private async metricsFor(
    schoolId: string,
    filter: {
      examId?: string;
      examIds?: string[];
      classId?: string;
      subjectId?: string;
      departmentId?: string;
    },
  ): Promise<PercentageMetricDto> {
    return this.metricRows(schoolId, await this.resultsFor(schoolId, filter));
  }

  private async metricRows(schoolId: string, rows: ResultRow[]): Promise<PercentageMetricDto> {
    const values = rows.map((row) => Number(row.percentage));
    const passRate = await this.passRate(schoolId, rows);
    return { ...summarizePercentages(values), passRate };
  }

  private async passRate(schoolId: string, rows: ResultRow[]): Promise<number | null> {
    const ids = [
      ...new Set(
        rows.map((row) => row.gradingScaleVersionId).filter((id): id is string => id !== null),
      ),
    ];
    if (!ids.length) return null;
    const bands = await withTenant(prisma, schoolId, (tx) =>
      tx.gradingScaleBand.findMany({
        where: { schoolId, versionId: { in: ids }, isPassing: true },
        select: { versionId: true, label: true },
      }),
    );
    if (!bands.length) return null;
    return frozenPassRate(
      rows.map((row) => ({
        percentage: Number(row.percentage),
        grade: row.grade,
        gradingScaleVersionId: row.gradingScaleVersionId,
      })),
      bands,
    );
  }

  private async trendFor(
    schoolId: string,
    id: string,
    name: string,
    filter: {
      academicSessionId?: string;
      academicTermId?: string;
      departmentId?: string;
      subjectId?: string;
    },
  ): Promise<AnalyticsTrendDto> {
    const exams = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.findMany({
        where: this.examWhere(schoolId, filter),
        select: { id: true },
      }),
    );
    const examIds = exams.map((exam) => exam.id);
    return {
      id,
      name,
      ...(await this.metricsFor(schoolId, {
        examIds,
        ...(filter.departmentId && { departmentId: filter.departmentId }),
        ...(filter.subjectId && { subjectId: filter.subjectId }),
      })),
      participation: await this.participationFor(schoolId, { examIds }),
      examCount: examIds.length,
      attemptCount: await withTenant(prisma, schoolId, (tx) =>
        tx.examAttempt.count({ where: { schoolId, examId: { in: examIds } } }),
      ),
    };
  }

  private async participationFor(
    schoolId: string,
    filter: { examId?: string; examIds?: string[]; classId?: string },
  ): Promise<ParticipationMetricDto> {
    const where: Prisma.ExamParticipationWhereInput = {
      schoolId,
      ...(filter.examId && { examId: filter.examId }),
      ...(filter.examIds && { examId: { in: filter.examIds } }),
    };
    const attemptWhere: Prisma.ExamAttemptWhereInput = {
      schoolId,
      ...(filter.examId && { examId: filter.examId }),
      ...(filter.examIds && { examId: { in: filter.examIds } }),
    };
    // Class IDs are session-specific. Historical enrollment, rather than the
    // student's current ACTIVE row, preserves the class that actually sat it.
    const studentProfileWhere: Prisma.StudentProfileWhereInput | undefined = filter.classId
      ? { enrollments: { some: { schoolId, classId: filter.classId } } }
      : undefined;
    const [participants, participations, attempts] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.examSessionParticipant.findMany({
          where: {
            schoolId,
            ...(filter.examId || filter.examIds
              ? {
                  session: {
                    ...(filter.examId && { examId: filter.examId }),
                    ...(filter.examIds && { examId: { in: filter.examIds } }),
                  },
                }
              : {}),
            ...(studentProfileWhere && { studentProfile: studentProfileWhere }),
          },
          select: { studentProfileId: true, examSessionId: true },
        }),
        tx.examParticipation.findMany({
          where: { ...where, ...(studentProfileWhere && { studentProfile: studentProfileWhere }) },
          select: { studentProfileId: true, examSessionId: true, status: true },
        }),
        tx.examAttempt.findMany({
          where: {
            ...attemptWhere,
            ...(studentProfileWhere && { studentProfile: studentProfileWhere }),
          },
          select: { studentProfileId: true, examSessionId: true, state: true },
        }),
      ]),
    );
    const sessionExamIds = await withTenant(prisma, schoolId, (tx) =>
      tx.examSession.findMany({
        where: { schoolId, id: { in: participants.map((entry) => entry.examSessionId) } },
        select: { id: true, examId: true },
      }),
    );
    const examBySession = new Map(sessionExamIds.map((session) => [session.id, session.examId]));
    // ADR-0024 rolls a student across sessions of ONE exam. A school/dept
    // aggregate therefore groups by (exam, student), never student alone.
    const groups = new Map<string, typeof participants>();
    for (const participant of participants) {
      const examId = examBySession.get(participant.examSessionId);
      if (!examId) continue;
      const key = `${examId}:${participant.studentProfileId}`;
      groups.set(key, [...(groups.get(key) ?? []), participant]);
    }
    const states = [...groups.values()].map((entries) =>
      rollUpParticipation(
        entries.map((entry) => ({
          status:
            participations.find(
              (fact) =>
                fact.studentProfileId === entry.studentProfileId &&
                fact.examSessionId === entry.examSessionId,
            )?.status ?? null,
          hasNonInvalidatedAttempt: attempts.some(
            (attempt) =>
              attempt.studentProfileId === entry.studentProfileId &&
              attempt.examSessionId === entry.examSessionId &&
              attempt.state !== 'INVALIDATED' &&
              attempt.state !== 'CANCELLED',
          ),
        })),
      ),
    );
    const attendedCount = states.filter((state) => state === 'ATTENDED').length;
    const absentCount = states.filter((state) => state === 'ABSENT').length;
    const pendingCount = states.filter((state) => state === 'PENDING').length;
    return {
      expectedStudentCount: states.length,
      attendedCount,
      absentCount,
      pendingCount,
      completionRate: states.length ? round((attendedCount / states.length) * 100) : null,
    };
  }
}
