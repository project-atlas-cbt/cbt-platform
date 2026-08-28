import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { resolveActorRole } from './actor.util.js';
import { TermService } from './term.service.js';
import {
  AcademicTermListResponseDto,
  AcademicTermResponseDto,
  CreateAcademicTermDto,
  UpdateAcademicTermDto,
} from './dto/term.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('academics')
@Controller('academics')
export class TermController {
  constructor(private readonly terms: TermService) {}

  @Get('sessions/:sessionId/terms')
  @Authorized('schoolConfig.term.view')
  @ApiOperation({ summary: "List a session's terms (07 §6.2)." })
  @ApiOkResponse({ type: AcademicTermListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Param('sessionId') sessionId: string,
  ): Promise<AcademicTermListResponseDto> {
    const terms = await this.terms.list(currentUser(req).schoolId, sessionId);
    return { terms };
  }

  @Post('sessions/:sessionId/terms')
  @HttpCode(HttpStatus.CREATED)
  @Authorized('schoolConfig.term.manage')
  @ApiOperation({ summary: 'Create a term within a session.' })
  @ApiOkResponse({ type: AcademicTermResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Param('sessionId') sessionId: string,
    @Body() body: CreateAcademicTermDto,
  ): Promise<AcademicTermResponseDto> {
    const user = currentUser(req);
    return this.terms.create(user.schoolId, sessionId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch('terms/:id')
  @Authorized('schoolConfig.term.manage')
  @ApiOperation({ summary: 'Edit a DRAFT or UPCOMING term.' })
  @ApiOkResponse({ type: AcademicTermResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateAcademicTermDto,
  ): Promise<AcademicTermResponseDto> {
    const user = currentUser(req);
    return this.terms.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post('terms/:id/activate')
  @HttpCode(HttpStatus.OK)
  @Authorized('schoolConfig.term.manage')
  @ApiOperation({
    summary: 'Make this term CURRENT within its session (feeds GET /academics/context).',
  })
  @ApiOkResponse({ type: AcademicTermResponseDto })
  async activate(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<AcademicTermResponseDto> {
    const user = currentUser(req);
    return this.terms.activate(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Delete('terms/:id')
  @Authorized('schoolConfig.term.manage')
  @ApiOperation({ summary: 'Delete a term.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.terms.delete(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
    return { status: 'ok' };
  }
}
