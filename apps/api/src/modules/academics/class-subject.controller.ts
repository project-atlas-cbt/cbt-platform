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
import { ClassSubjectService } from './class-subject.service.js';
import {
  ClassSubjectListResponseDto,
  ClassSubjectResponseDto,
  CreateClassSubjectDto,
  UpdateClassSubjectDto,
} from './dto/class-subject.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('academics')
@Controller('academics')
export class ClassSubjectController {
  constructor(private readonly classSubjects: ClassSubjectService) {}

  @Get('classes/:id/subjects')
  @Authorized('schoolConfig.class.view')
  @ApiOperation({ summary: 'Offerings for a class (roadmap-named endpoint, 07 §6.6).' })
  @ApiOkResponse({ type: ClassSubjectListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Param('id') classId: string,
  ): Promise<ClassSubjectListResponseDto> {
    const offerings = await this.classSubjects.listForClass(currentUser(req).schoolId, classId);
    return { offerings };
  }

  @Post('classes/:id/subjects')
  @HttpCode(HttpStatus.CREATED)
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Offer a subject to a class.' })
  @ApiOkResponse({ type: ClassSubjectResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Param('id') classId: string,
    @Body() body: CreateClassSubjectDto,
  ): Promise<ClassSubjectResponseDto> {
    const user = currentUser(req);
    return this.classSubjects.create(user.schoolId, classId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch('class-subjects/:id')
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Make an offering compulsory or elective (ADR-0038).' })
  @ApiOkResponse({ type: ClassSubjectResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateClassSubjectDto,
  ): Promise<ClassSubjectResponseDto> {
    const user = currentUser(req);
    return this.classSubjects.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Delete('class-subjects/:id')
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Remove a class-subject offering.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.classSubjects.remove(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
    return { status: 'ok' };
  }
}
