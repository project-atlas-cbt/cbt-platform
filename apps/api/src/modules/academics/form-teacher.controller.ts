import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { resolveActorRole } from './actor.util.js';
import {
  FormTeacherListResponseDto,
  MyFormClassesResponseDto,
  ReplaceFormTeachersDto,
} from './dto/form-teacher.dto.js';
import { FormTeacherService } from './form-teacher.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** ADR-0038 amendment (2026-10-09) — form teachers. Assigning one is
 * `assignments.teacherToClass` ("Assign teacher → class"), which had no
 * route of its own until now. */
@ApiTags('academics')
@Controller()
export class FormTeacherController {
  constructor(private readonly formTeachers: FormTeacherService) {}

  @Get('teachers/me/form-classes')
  @Authorized('assignments.view')
  @ApiOperation({ summary: "The caller's own form classes, outside closed or archived sessions." })
  @ApiOkResponse({ type: MyFormClassesResponseDto })
  async mine(@Req() req: FastifyRequest): Promise<MyFormClassesResponseDto> {
    const user = currentUser(req);
    return {
      classes: await this.formTeachers.listForCurrentTeacher(user.schoolId, user.membershipId),
    };
  }

  @Get('academics/classes/:id/form-teachers')
  @Authorized('schoolConfig.class.view')
  @ApiOperation({ summary: "A class's current form teachers." })
  @ApiOkResponse({ type: FormTeacherListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Param('id') classId: string,
  ): Promise<FormTeacherListResponseDto> {
    return {
      formTeachers: await this.formTeachers.listForClass(currentUser(req).schoolId, classId),
    };
  }

  @Put('academics/classes/:id/form-teachers')
  @Authorized('assignments.teacherToClass')
  @ApiOperation({
    summary: "Set a class's form teachers. Anyone left out is ended, never deleted.",
  })
  @ApiOkResponse({ type: FormTeacherListResponseDto })
  async replace(
    @Req() req: FastifyRequest,
    @Param('id') classId: string,
    @Body() body: ReplaceFormTeachersDto,
  ): Promise<FormTeacherListResponseDto> {
    const user = currentUser(req);
    return {
      formTeachers: await this.formTeachers.replaceForClass(
        user.schoolId,
        classId,
        body.teacherProfileIds,
        { actorUserId: user.userId, actorRole: resolveActorRole(user) },
      ),
    };
  }
}
