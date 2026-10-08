import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { resolveActorRole, selfOnlyMembershipId } from './actor.util.js';
import { assertCanViewStudent } from './people-scope.util.js';
import {
  ClassRegistrationGridResponseDto,
  StudentSubjectRegistrationListResponseDto,
  StudentSubjectRegistrationResponseDto,
  UpdateClassRegistrationsDto,
  UpdateClassRegistrationsResponseDto,
} from './dto/student-subject-registration.dto.js';
import { StudentSubjectRegistrationService } from './student-subject-registration.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** ADR-0011 — StudentSubjectRegistration. Not literally listed in the
 * roadmap's own `people.v1` endpoint table, but DoD item 10 requires the
 * *capability* to deregister/re-register — a documented, minimal addition
 * in the same spirit as B5's own `POST .../terms/:id/activate` and B3's
 * "renewal history" gap-closures, not silent scope expansion. */
@ApiTags('people')
@Controller()
export class StudentSubjectRegistrationController {
  constructor(private readonly registrations: StudentSubjectRegistrationService) {}

  @Get('students/:id/subject-registrations')
  @Authorized('assignments.view')
  @ApiOperation({ summary: "A student's current enrollment's subject registrations." })
  @ApiOkResponse({ type: StudentSubjectRegistrationListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Param('id') studentProfileId: string,
  ): Promise<StudentSubjectRegistrationListResponseDto> {
    const user = currentUser(req);
    await assertCanViewStudent(user, studentProfileId);
    return this.registrations.listForStudent(
      user.schoolId,
      studentProfileId,
      selfOnlyMembershipId(user),
    );
  }

  @Post('students/:id/subject-registrations/:classSubjectId/deregister')
  @HttpCode(HttpStatus.OK)
  @Authorized('assignments.studentToClass')
  @ApiOperation({
    summary:
      'Deregister a student from an elective (ADR-0011) — effective for future exams only; ' +
      'historical attempts/results are untouched.',
  })
  @ApiOkResponse({ type: StudentSubjectRegistrationResponseDto })
  async deregister(
    @Req() req: FastifyRequest,
    @Param('id') studentProfileId: string,
    @Param('classSubjectId') classSubjectId: string,
  ): Promise<StudentSubjectRegistrationResponseDto> {
    const user = currentUser(req);
    return this.registrations.deregister(user.schoolId, studentProfileId, classSubjectId, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post('students/:id/subject-registrations/:classSubjectId/re-register')
  @HttpCode(HttpStatus.OK)
  @Authorized('assignments.studentToClass')
  @ApiOperation({
    summary:
      'Register a student for a subject their class offers, including an elective they never had (ADR-0038).',
  })
  @ApiOkResponse({ type: StudentSubjectRegistrationResponseDto })
  async reRegister(
    @Req() req: FastifyRequest,
    @Param('id') studentProfileId: string,
    @Param('classSubjectId') classSubjectId: string,
  ): Promise<StudentSubjectRegistrationResponseDto> {
    const user = currentUser(req);
    return this.registrations.reRegister(user.schoolId, studentProfileId, classSubjectId, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Get('academics/classes/:id/subject-registrations')
  @Authorized('assignments.studentToClass')
  @ApiOperation({
    summary:
      'The class subject grid (ADR-0038): every current student and offering, with choice-group warnings.',
  })
  @ApiOkResponse({ type: ClassRegistrationGridResponseDto })
  async grid(
    @Req() req: FastifyRequest,
    @Param('id') classId: string,
  ): Promise<ClassRegistrationGridResponseDto> {
    return this.registrations.classGrid(currentUser(req).schoolId, classId);
  }

  @Put('academics/classes/:id/subject-registrations')
  @Authorized('assignments.studentToClass')
  @ApiOperation({
    summary:
      'Save ticks from the class subject grid in one transaction. Effective for future exams only.',
  })
  @ApiOkResponse({ type: UpdateClassRegistrationsResponseDto })
  async saveGrid(
    @Req() req: FastifyRequest,
    @Param('id') classId: string,
    @Body() body: UpdateClassRegistrationsDto,
  ): Promise<UpdateClassRegistrationsResponseDto> {
    const user = currentUser(req);
    return this.registrations.updateClassGrid(user.schoolId, classId, body.changes, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }
}
