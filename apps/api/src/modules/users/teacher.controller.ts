import {
  Body,
  Controller,
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
import { resolveActorRole } from '../academics/actor.util.js';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import {
  CreateTeacherDto,
  TeacherListResponseDto,
  TeacherResponseDto,
  UpdateTeacherDto,
} from './dto/teacher.dto.js';
import { TeacherService } from './teacher.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('people')
@Controller('teachers')
export class TeacherController {
  constructor(private readonly teachers: TeacherService) {}

  @Get()
  @Authorized('users.teacher.view')
  @ApiOperation({ summary: "List the school's teachers (05 §11.1)." })
  @ApiOkResponse({ type: TeacherListResponseDto })
  async list(@Req() req: FastifyRequest): Promise<TeacherListResponseDto> {
    const teachers = await this.teachers.list(currentUser(req).schoolId);
    return { teachers };
  }

  @Get(':id')
  @Authorized('users.teacher.view')
  @ApiOperation({ summary: 'Get one teacher profile.' })
  @ApiOkResponse({ type: TeacherResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string): Promise<TeacherResponseDto> {
    return this.teachers.get(currentUser(req).schoolId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('users.teacher.create')
  @ApiOperation({ summary: 'Create a teacher (dispatches an invitation email).' })
  @ApiOkResponse({ type: TeacherResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateTeacherDto,
  ): Promise<TeacherResponseDto> {
    const user = currentUser(req);
    return this.teachers.create(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch(':id')
  @Authorized('users.teacher.edit')
  @ApiOperation({ summary: 'Edit a teacher.' })
  @ApiOkResponse({ type: TeacherResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateTeacherDto,
  ): Promise<TeacherResponseDto> {
    const user = currentUser(req);
    return this.teachers.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Authorized('users.teacher.deactivate')
  @ApiOperation({
    summary:
      "Deactivate a teacher's account — their questions and exams remain, still attributed " +
      'to them (DoD item 6).',
  })
  @ApiOkResponse({ type: TeacherResponseDto })
  async deactivate(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<TeacherResponseDto> {
    const user = currentUser(req);
    return this.teachers.deactivate(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Authorized('users.teacher.deactivate')
  @ApiOperation({ summary: "Reactivate a teacher's account." })
  @ApiOkResponse({ type: TeacherResponseDto })
  async reactivate(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<TeacherResponseDto> {
    const user = currentUser(req);
    return this.teachers.reactivate(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/reset-credentials')
  @HttpCode(HttpStatus.OK)
  @Authorized('users.teacher.resetCredentials')
  @ApiOperation({
    summary: 'Send a teacher a fresh invitation link to set a new password (audited).',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async resetCredentials(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    return this.teachers.resetCredentials(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }
}
