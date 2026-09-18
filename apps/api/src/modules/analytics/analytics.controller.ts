import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsCacheService } from './analytics-cache.service.js';
import {
  AnalyticsContextQueryDto,
  ClassAnalyticsQueryDto,
  ClassAnalyticsResponseDto,
  DepartmentAnalyticsResponseDto,
  ExamAnalyticsResponseDto,
  QuestionAnalyticsResponseDto,
  SchoolAnalyticsResponseDto,
  StudentAnalyticsResponseDto,
} from './dto/analytics.dto.js';

function user(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly cache: AnalyticsCacheService,
  ) {}

  @Get('exams/:id')
  @Authorized('analytics.examCompletionStats')
  @ApiOperation({ summary: 'Derived exam performance, participation and distribution.' })
  @ApiOkResponse({ type: ExamAnalyticsResponseDto })
  async exam(@Req() req: FastifyRequest, @Param('id') id: string) {
    const actor = user(req);
    const authorized = actorFromAuthenticatedUser(actor);
    await this.analytics.authorizeExam(
      actor.schoolId,
      authorized,
      id,
      'analytics.examCompletionStats',
    );
    return this.cache.read(
      actor.schoolId,
      `${actor.membershipId}:${actor.roles.join(',')}`,
      `exam:${id}`,
      {},
      () => this.analytics.exam(actor.schoolId, authorized, id),
    );
  }

  @Get('exams/:id/questions')
  @Authorized('analytics.questionDifficulty')
  @ApiOperation({
    summary: 'Per-question correct, incorrect and unanswered rates for one fixed-selection exam.',
  })
  @ApiOkResponse({ type: QuestionAnalyticsResponseDto })
  async questions(@Req() req: FastifyRequest, @Param('id') id: string) {
    const actor = user(req);
    const authorized = actorFromAuthenticatedUser(actor);
    await this.analytics.authorizeExam(
      actor.schoolId,
      authorized,
      id,
      'analytics.questionDifficulty',
    );
    return this.cache.read(
      actor.schoolId,
      `${actor.membershipId}:${actor.roles.join(',')}`,
      `exam-questions:${id}`,
      {},
      () => this.analytics.questions(actor.schoolId, authorized, id),
    );
  }

  @Get('classes/:id')
  @Authorized('analytics.class')
  @ApiOkResponse({ type: ClassAnalyticsResponseDto })
  async class(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() query: ClassAnalyticsQueryDto,
  ) {
    const actor = user(req);
    const authorized = actorFromAuthenticatedUser(actor);
    await this.analytics.authorizeClass(actor.schoolId, authorized, id, query);
    return this.cache.read(
      actor.schoolId,
      `${actor.membershipId}:${actor.roles.join(',')}`,
      `class:${id}`,
      query,
      () => this.analytics.class(actor.schoolId, authorized, id, query),
    );
  }

  @Get('departments/:id')
  @Authorized('analytics.department')
  @ApiOkResponse({ type: DepartmentAnalyticsResponseDto })
  async department(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() query: AnalyticsContextQueryDto,
  ) {
    const actor = user(req);
    const authorized = actorFromAuthenticatedUser(actor);
    await this.analytics.authorizeDepartment(actor.schoolId, authorized, id, query);
    return this.cache.read(
      actor.schoolId,
      `${actor.membershipId}:${actor.roles.join(',')}`,
      `department:${id}`,
      query,
      () => this.analytics.department(actor.schoolId, authorized, id, query),
    );
  }

  @Get('school')
  @Authorized('analytics.schoolWide')
  @ApiOkResponse({ type: SchoolAnalyticsResponseDto })
  async school(@Req() req: FastifyRequest, @Query() query: AnalyticsContextQueryDto) {
    const actor = user(req);
    const authorized = actorFromAuthenticatedUser(actor);
    await this.analytics.authorizeSchool(actor.schoolId, authorized, query);
    return this.cache.read(
      actor.schoolId,
      `${actor.membershipId}:${actor.roles.join(',')}`,
      'school',
      query,
      () => this.analytics.school(actor.schoolId, authorized, query),
    );
  }

  @Get('students/:id')
  @Authorized('analytics.studentHistory')
  @ApiOkResponse({ type: StudentAnalyticsResponseDto })
  async student(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() query: AnalyticsContextQueryDto,
  ) {
    const actor = user(req);
    const authorized = actorFromAuthenticatedUser(actor);
    await this.analytics.authorizeStudent(actor.schoolId, authorized, id, query);
    return this.cache.read(
      actor.schoolId,
      `${actor.membershipId}:${actor.roles.join(',')}`,
      `student:${id}`,
      query,
      () => this.analytics.student(actor.schoolId, authorized, id, query),
    );
  }
}
