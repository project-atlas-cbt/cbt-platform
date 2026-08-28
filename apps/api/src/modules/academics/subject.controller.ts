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
import { SubjectService } from './subject.service.js';
import {
  CreateSubjectDto,
  SubjectListResponseDto,
  SubjectResponseDto,
  UpdateSubjectDto,
} from './dto/subject.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('academics')
@Controller('academics/subjects')
export class SubjectController {
  constructor(private readonly subjects: SubjectService) {}

  @Get()
  @Authorized('schoolConfig.subject.view')
  @ApiOperation({ summary: "List the school's subjects (07 §6.5)." })
  @ApiOkResponse({ type: SubjectListResponseDto })
  async list(@Req() req: FastifyRequest): Promise<SubjectListResponseDto> {
    const subjects = await this.subjects.list(currentUser(req).schoolId);
    return { subjects };
  }

  @Get(':id')
  @Authorized('schoolConfig.subject.view')
  @ApiOperation({ summary: 'Get one subject.' })
  @ApiOkResponse({ type: SubjectResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string): Promise<SubjectResponseDto> {
    return this.subjects.get(currentUser(req).schoolId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Create a subject.' })
  @ApiOkResponse({ type: SubjectResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateSubjectDto,
  ): Promise<SubjectResponseDto> {
    const user = currentUser(req);
    return this.subjects.create(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch(':id')
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Edit a subject, including assigning its department (FR AC-05).' })
  @ApiOkResponse({ type: SubjectResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateSubjectDto,
  ): Promise<SubjectResponseDto> {
    const user = currentUser(req);
    return this.subjects.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Deactivate a subject — always allowed, never breaks history.' })
  @ApiOkResponse({ type: SubjectResponseDto })
  async deactivate(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<SubjectResponseDto> {
    const user = currentUser(req);
    return this.subjects.deactivate(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Delete(':id')
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Hard-delete a subject (blocked if offerings exist).' })
  @ApiOkResponse({ type: StatusResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.subjects.delete(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
    return { status: 'ok' };
  }
}
