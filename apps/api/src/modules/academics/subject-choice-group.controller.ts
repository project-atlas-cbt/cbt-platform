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
import {
  CreateSubjectChoiceGroupDto,
  SubjectChoiceGroupListResponseDto,
  SubjectChoiceGroupResponseDto,
  UpdateSubjectChoiceGroupDto,
} from './dto/subject-choice-group.dto.js';
import { SubjectChoiceGroupService } from './subject-choice-group.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** ADR-0038 — subject choice groups ("pick one of CRS or IRS"). */
@ApiTags('academics')
@Controller('academics/subject-choice-groups')
export class SubjectChoiceGroupController {
  constructor(private readonly groups: SubjectChoiceGroupService) {}

  @Get()
  @Authorized('schoolConfig.subject.view')
  @ApiOperation({ summary: "List the school's subject choice groups (ADR-0038)." })
  @ApiOkResponse({ type: SubjectChoiceGroupListResponseDto })
  async list(@Req() req: FastifyRequest): Promise<SubjectChoiceGroupListResponseDto> {
    return { choiceGroups: await this.groups.list(currentUser(req).schoolId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Create a subject choice group.' })
  @ApiOkResponse({ type: SubjectChoiceGroupResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateSubjectChoiceGroupDto,
  ): Promise<SubjectChoiceGroupResponseDto> {
    const user = currentUser(req);
    return this.groups.create(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch(':id')
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Rename a choice group or change its rule.' })
  @ApiOkResponse({ type: SubjectChoiceGroupResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateSubjectChoiceGroupDto,
  ): Promise<SubjectChoiceGroupResponseDto> {
    const user = currentUser(req);
    return this.groups.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Delete(':id')
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Delete a choice group that no subject is in.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.groups.remove(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
    return { status: 'ok' };
  }
}
