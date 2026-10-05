import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { ResultQueryService } from '../results/result-query.service.js';
import { ExamResultsResponseDto, ListExamResultsQueryDto } from '../results/dto/result.dto.js';
import {
  AnalyticsContextQueryDto,
  ClassAnalyticsQueryDto,
  ClassAnalyticsResponseDto,
  ExamAnalyticsResponseDto,
  QuestionAnalyticsResponseDto,
  StudentAnalyticsResponseDto,
} from '../analytics/dto/analytics.dto.js';

/** Data-only endpoints for F18's ADR-0030 browser print routes. */
@ApiTags('reports')
@Controller('reports')
export class PrintDataController {
  constructor(
    private readonly results: ResultQueryService,
    private readonly analytics: AnalyticsService,
  ) {}
  @Get('exams/:id/results')
  @Authorized('reporting.generatePrintableReports')
  @ApiOperation({ summary: 'Print-ready scoped exam result dataset.' })
  @ApiOkResponse({ type: ExamResultsResponseDto })
  examResults(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() query: ListExamResultsQueryDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.results.listForExam(user.schoolId, actorFromAuthenticatedUser(user), id, {
      ...query,
      page: 1,
      pageSize: Math.min(query.pageSize ?? 500, 500),
    });
  }
  @Get('exams/:id/performance')
  @Authorized('reporting.generatePrintableReports')
  @ApiOperation({ summary: 'Print-ready scoped exam and question performance.' })
  @ApiExtraModels(ExamAnalyticsResponseDto, QuestionAnalyticsResponseDto)
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['summary', 'questions'],
      properties: {
        summary: { $ref: getSchemaPath(ExamAnalyticsResponseDto) },
        questions: { $ref: getSchemaPath(QuestionAnalyticsResponseDto) },
      },
    },
  })
  async examPerformance(@Req() req: FastifyRequest, @Param('id') id: string) {
    const user = req.user as AuthenticatedUser;
    const actor = actorFromAuthenticatedUser(user);
    await this.analytics.authorizeExam(user.schoolId, actor, id, 'analytics.examCompletionStats');
    const [summary, questions] = await Promise.all([
      this.analytics.exam(user.schoolId, actor, id),
      this.analytics.questions(user.schoolId, actor, id),
    ]);
    return { summary, questions };
  }

  @Get('classes/:id/performance')
  @Authorized('reporting.generatePrintableReports')
  @ApiOperation({ summary: 'Print-ready scoped class performance dataset.' })
  @ApiOkResponse({ type: ClassAnalyticsResponseDto })
  classPerformance(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() query: ClassAnalyticsQueryDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.analytics.class(user.schoolId, actorFromAuthenticatedUser(user), id, query);
  }

  @Get('students/:id/performance')
  @Authorized('reporting.generatePrintableReports')
  @ApiOperation({ summary: 'Print-ready scoped student performance dataset.' })
  @ApiOkResponse({ type: StudentAnalyticsResponseDto })
  studentPerformance(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() query: AnalyticsContextQueryDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.analytics.student(user.schoolId, actorFromAuthenticatedUser(user), id, query);
  }

  @Get('exams/:id/questions/performance')
  @Authorized('reporting.generatePrintableReports')
  @ApiOperation({ summary: 'Print-ready scoped question-performance dataset.' })
  @ApiOkResponse({ type: QuestionAnalyticsResponseDto })
  questionPerformance(@Req() req: FastifyRequest, @Param('id') id: string) {
    const user = req.user as AuthenticatedUser;
    return this.analytics.questions(user.schoolId, actorFromAuthenticatedUser(user), id);
  }
}
