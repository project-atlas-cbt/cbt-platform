import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { resolveActorRole } from './actor.util.js';
import {
  CommitRolloverDto,
  CreateRolloverPlanDto,
  RolloverPlanResponseDto,
  RolloverQueryDto,
  UpdateRolloverDecisionsDto,
  UpdateRolloverStructureDto,
} from './dto/rollover.dto.js';
import { RolloverService } from './rollover.service.js';
import { AppHttpException } from '../../common/app-http-exception.js';

function user(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('academics')
@Controller('academics')
export class RolloverController {
  constructor(private readonly rollovers: RolloverService) {}

  @Get('sessions/:id/close-readiness')
  @Authorized('progression.promote.view')
  @ApiOperation({ summary: 'Return academic-session close readiness.' })
  @ApiOkResponse({
    description: 'Session close readiness.',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        sessionStatus: { type: 'string' },
        activeExams: { type: 'number' },
        pendingResults: { type: 'number' },
        activeStudents: { type: 'number' },
        ready: { type: 'boolean' },
      },
      required: [
        'sessionId',
        'sessionStatus',
        'activeExams',
        'pendingResults',
        'activeStudents',
        'ready',
      ],
    },
  })
  async readiness(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = user(req);
    // Readiness aggregates school-wide active exams/results. HOD promotion
    // review remains department-scoped through GET /rollovers/:id; it must
    // not expose these cross-department operational counts.
    if (!u.roles.includes('SCHOOL_ADMIN') && !u.roles.includes('MODERATOR')) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'Only school operators may view close readiness.',
      });
    }
    return this.rollovers.readiness(u.schoolId, id);
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  @Authorized('progression.promote.execute')
  @ApiOperation({ summary: 'Close a ready CURRENT academic session for rollover.' })
  async close(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const u = user(req);
    return this.rollovers.close(u.schoolId, id, {
      actorUserId: u.userId,
      actorRole: resolveActorRole(u),
    });
  }

  @Post('sessions/:id/rollover/plan')
  @HttpCode(201)
  @Authorized('progression.promote.execute')
  @ApiOkResponse({ type: RolloverPlanResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateRolloverPlanDto,
  ) {
    const u = user(req);
    return this.rollovers.createPlan(u.schoolId, id, body, {
      actorUserId: u.userId,
      actorRole: resolveActorRole(u),
    });
  }

  @Get('rollovers/:id')
  @Authorized('progression.reviewPromotionList')
  @ApiOkResponse({ type: RolloverPlanResponseDto })
  async get(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: RolloverQueryDto,
  ) {
    const u = user(req);
    return this.rollovers.getPlan(u.schoolId, id, query, {
      membershipId: u.membershipId,
      roles: u.roles,
    });
  }

  @Patch('rollovers/:id/decisions')
  @Authorized('progression.promote.execute')
  async decisions(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateRolloverDecisionsDto,
  ) {
    const u = user(req);
    return this.rollovers.updateDecisions(u.schoolId, id, body, {
      actorUserId: u.userId,
      actorRole: resolveActorRole(u),
    });
  }

  @Patch('rollovers/:id/structure')
  @Authorized('progression.promote.execute')
  async structure(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateRolloverStructureDto,
  ) {
    const u = user(req);
    return this.rollovers.updateStructure(u.schoolId, id, body, {
      actorUserId: u.userId,
      actorRole: resolveActorRole(u),
    });
  }

  @Post('rollovers/:id/commit')
  @HttpCode(200)
  @Authorized('progression.promote.execute')
  async commit(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CommitRolloverDto,
  ) {
    const u = user(req);
    return this.rollovers.commit(u.schoolId, id, body.version, {
      actorUserId: u.userId,
      actorRole: resolveActorRole(u),
    });
  }
}
