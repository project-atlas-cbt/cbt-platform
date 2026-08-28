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
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { resolveActorRole } from './actor.util.js';
import { ClassGroupService } from './class-group.service.js';
import {
  ClassGroupListResponseDto,
  ClassGroupResponseDto,
  CreateClassGroupDto,
  UpdateClassGroupDto,
} from './dto/class-group.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('academics')
@Controller('academics/classes')
export class ClassGroupController {
  constructor(private readonly classes: ClassGroupService) {}

  @Get()
  @Authorized('schoolConfig.class.view')
  @ApiOperation({ summary: "List the school's classes (07 §6.4), optionally filtered by session." })
  @ApiQuery({ name: 'academicSessionId', required: false })
  @ApiOkResponse({ type: ClassGroupListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Query('academicSessionId') academicSessionId?: string,
  ): Promise<ClassGroupListResponseDto> {
    const classes = await this.classes.list(currentUser(req).schoolId, academicSessionId);
    return { classes };
  }

  @Get(':id')
  @Authorized('schoolConfig.class.view')
  @ApiOperation({ summary: 'Get one class.' })
  @ApiOkResponse({ type: ClassGroupResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string): Promise<ClassGroupResponseDto> {
    return this.classes.get(currentUser(req).schoolId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('schoolConfig.class.manage')
  @ApiOperation({ summary: 'Create a class within a session.' })
  @ApiOkResponse({ type: ClassGroupResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateClassGroupDto,
  ): Promise<ClassGroupResponseDto> {
    const user = currentUser(req);
    return this.classes.create(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch(':id')
  @Authorized('schoolConfig.class.manage')
  @ApiOperation({ summary: 'Edit a class.' })
  @ApiOkResponse({ type: ClassGroupResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateClassGroupDto,
  ): Promise<ClassGroupResponseDto> {
    const user = currentUser(req);
    return this.classes.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Authorized('schoolConfig.class.manage')
  @ApiOperation({ summary: 'Archive a class (FR AC-04) — always allowed.' })
  @ApiOkResponse({ type: ClassGroupResponseDto })
  async archive(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ClassGroupResponseDto> {
    const user = currentUser(req);
    return this.classes.archive(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Delete(':id')
  @Authorized('schoolConfig.class.manage')
  @ApiOperation({ summary: 'Hard-delete a class (blocked if offerings exist).' })
  @ApiOkResponse({ type: StatusResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.classes.delete(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
    return { status: 'ok' };
  }
}
