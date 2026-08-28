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
import { SessionService } from './session.service.js';
import {
  AcademicSessionListResponseDto,
  AcademicSessionResponseDto,
  CreateAcademicSessionDto,
  UpdateAcademicSessionDto,
} from './dto/session.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('academics')
@Controller('academics/sessions')
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  @Authorized('schoolConfig.session.view')
  @ApiOperation({ summary: "List the school's academic sessions (07 §6.1)." })
  @ApiOkResponse({ type: AcademicSessionListResponseDto })
  async list(@Req() req: FastifyRequest): Promise<AcademicSessionListResponseDto> {
    const sessions = await this.sessions.list(currentUser(req).schoolId);
    return { sessions };
  }

  @Get(':id')
  @Authorized('schoolConfig.session.view')
  @ApiOperation({ summary: 'Get one academic session.' })
  @ApiOkResponse({ type: AcademicSessionResponseDto })
  async get(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<AcademicSessionResponseDto> {
    return this.sessions.get(currentUser(req).schoolId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('schoolConfig.session.manage')
  @ApiOperation({ summary: 'Create an academic session (starts DRAFT).' })
  @ApiOkResponse({ type: AcademicSessionResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateAcademicSessionDto,
  ): Promise<AcademicSessionResponseDto> {
    const user = currentUser(req);
    return this.sessions.create(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch(':id')
  @Authorized('schoolConfig.session.manage')
  @ApiOperation({ summary: 'Edit a DRAFT or UPCOMING session.' })
  @ApiOkResponse({ type: AcademicSessionResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateAcademicSessionDto,
  ): Promise<AcademicSessionResponseDto> {
    const user = currentUser(req);
    return this.sessions.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Authorized('schoolConfig.session.manage')
  @ApiOperation({
    summary: 'Make this session CURRENT (roadmap-named endpoint, DoD item 2).',
  })
  @ApiOkResponse({ type: AcademicSessionResponseDto })
  async activate(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<AcademicSessionResponseDto> {
    const user = currentUser(req);
    return this.sessions.activate(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Authorized('schoolConfig.session.manage')
  @ApiOperation({ summary: 'Archive a session (FR AC-01).' })
  @ApiOkResponse({ type: AcademicSessionResponseDto })
  async archive(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<AcademicSessionResponseDto> {
    const user = currentUser(req);
    return this.sessions.archive(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Delete(':id')
  @Authorized('schoolConfig.session.manage')
  @ApiOperation({
    summary: 'Hard-delete a session (blocked if terms/classes/offerings/HOD assignments exist).',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.sessions.delete(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
    return { status: 'ok' };
  }
}
