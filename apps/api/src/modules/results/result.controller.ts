import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { ResultAdjustmentService } from './result-adjustment.service.js';
import { ResultPublicationService } from './result-publication.service.js';
import { ResultQueryService } from './result-query.service.js';
import {
  CreateResultAdjustmentDto,
  ExamResultsResponseDto,
  ListExamResultsQueryDto,
  PublishResultsDto,
  ResultAdjustmentOperationResponseDto,
  ResultDetailResponseDto,
  ResultPublicationResponseDto,
  UnpublishResultsDto,
  WithholdResultDto,
} from './dto/result.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `results.v1` (B15 — Results & Publication; ADR-0010, ADR-0018, ADR-0025).
 *
 * Note what is NOT here: any endpoint that writes a score. `02 §6` and
 * `05 §53` both refuse a generic "edit score" control, so the only path to a
 * changed mark is `POST /results/adjustments` — a reasoned, audited,
 * replayable operation (DoD item 10).
 */
@ApiTags('results')
@Controller()
export class ResultController {
  constructor(
    private readonly query: ResultQueryService,
    private readonly publication: ResultPublicationService,
    private readonly adjustments: ResultAdjustmentService,
  ) {}

  @Get('exams/:id/results')
  @Authorized('results.viewExamResults')
  @ApiOperation({
    summary:
      'Scoped result list with exam summary statistics and, for a multi-class exam, a per-class breakdown (04 §48, ADR-0013).',
  })
  @ApiOkResponse({ type: ExamResultsResponseDto })
  async listForExam(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() query: ListExamResultsQueryDto,
  ): Promise<ExamResultsResponseDto> {
    const user = currentUser(req);
    return this.query.listForExam(user.schoolId, actorFromAuthenticatedUser(user), id, query);
  }

  @Get('results/:id')
  @Authorized('results.viewIndividualResult')
  @ApiOperation({
    summary: 'One result with its per-question breakdown and full adjustment history.',
  })
  @ApiOkResponse({ type: ResultDetailResponseDto })
  async getDetail(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ResultDetailResponseDto> {
    const user = currentUser(req);
    return this.query.getDetail(user.schoolId, actorFromAuthenticatedUser(user), id);
  }

  @Post('exams/:id/results/publish')
  @HttpCode(HttpStatus.OK)
  @Authorized('results.publish')
  @ApiOperation({
    summary:
      "Release this exam's results to students. Refused when the school has locked publication to administrative release (DoD item 7).",
  })
  @ApiOkResponse({ type: ResultPublicationResponseDto })
  async publish(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: PublishResultsDto,
  ): Promise<ResultPublicationResponseDto> {
    const user = currentUser(req);
    return this.publication.publish(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
    });
  }

  @Post('exams/:id/results/unpublish')
  @HttpCode(HttpStatus.OK)
  @Authorized('results.unpublish')
  @ApiOperation({ summary: 'Reverse publication, with a mandatory reason (05 §65).' })
  @ApiOkResponse({ type: ResultPublicationResponseDto })
  async unpublish(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UnpublishResultsDto,
  ): Promise<ResultPublicationResponseDto> {
    const user = currentUser(req);
    return this.publication.unpublish(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
    });
  }

  @Post('results/:id/withhold')
  @HttpCode(HttpStatus.OK)
  @Authorized('results.withhold')
  @ApiOperation({
    summary: 'Hold one disputed result back without unpublishing the cohort (ADR-0010).',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async withhold(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: WithholdResultDto,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    return this.publication.withhold(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
    });
  }

  @Post('results/:id/release')
  @HttpCode(HttpStatus.OK)
  @Authorized('results.withhold')
  @ApiOperation({ summary: 'Release a previously withheld result.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async release(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: WithholdResultDto,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    return this.publication.release(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
    });
  }

  @Post('results/adjustments')
  @HttpCode(HttpStatus.OK)
  @Authorized('results.adjust')
  @ApiOperation({
    summary:
      'The only path by which a score changes after marking. Creates a parent operation; a worker applies it idempotently and resumably (ADR-0025).',
  })
  @ApiOkResponse({ type: ResultAdjustmentOperationResponseDto })
  async createAdjustment(
    @Req() req: FastifyRequest,
    @Body() body: CreateResultAdjustmentDto,
  ): Promise<ResultAdjustmentOperationResponseDto> {
    const user = currentUser(req);
    return this.adjustments.create(user.schoolId, actorFromAuthenticatedUser(user), body, {
      actorUserId: user.userId,
    });
  }

  @Get('results/adjustments/:id')
  @Authorized('results.viewExamResults')
  @ApiOperation({ summary: 'Adjustment progress and outcome.' })
  @ApiOkResponse({ type: ResultAdjustmentOperationResponseDto })
  async getAdjustment(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ResultAdjustmentOperationResponseDto> {
    const user = currentUser(req);
    return this.adjustments.get(user.schoolId, actorFromAuthenticatedUser(user), id);
  }
}
