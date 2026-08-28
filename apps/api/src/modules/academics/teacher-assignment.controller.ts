import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { resolveActorRole } from './actor.util.js';
import {
  ClassTeachersResponseDto,
  ReplaceTeacherAssignmentsDto,
  TeacherAssignmentListResponseDto,
} from './dto/teacher-assignment.dto.js';
import { TeacherAssignmentService } from './teacher-assignment.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** `people.v1` — TeacherAssignment. See StudentEnrollmentController's own
 * doc comment for why this declares full per-route paths rather than a
 * shared class-level prefix. */
@ApiTags('people')
@Controller()
export class TeacherAssignmentController {
  constructor(private readonly assignments: TeacherAssignmentService) {}

  @Get('teachers/:id/assignments')
  @Authorized('assignments.view')
  @ApiOperation({ summary: "A teacher's current active assignments." })
  @ApiOkResponse({ type: TeacherAssignmentListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Param('id') teacherProfileId: string,
  ): Promise<TeacherAssignmentListResponseDto> {
    const assignments = await this.assignments.listForTeacher(
      currentUser(req).schoolId,
      teacherProfileId,
    );
    return { assignments };
  }

  // A ClassSubject bundles subject+class into one offering, so this single
  // PUT simultaneously implements both `assignments.teacherToSubject` and
  // `assignments.teacherToClass` (identical grants) — the latter chosen as
  // the canonical id since ClassSubject is fundamentally "this class's
  // offering." The former stays a correctly-graded, valid `GET
  // /v1/me/permissions` row with no separate controller of its own, the
  // same shape as several already-live rows in this table.
  @Put('teachers/:id/assignments')
  @Authorized('assignments.teacherToClass')
  @ApiOperation({
    summary:
      "Replace a teacher's subject×class assignment set for a session (04 §25, 05 §12.1) — " +
      'full-replace: removed pairs are ended (DoD item 5), not deleted.',
  })
  @ApiOkResponse({ type: TeacherAssignmentListResponseDto })
  async replace(
    @Req() req: FastifyRequest,
    @Param('id') teacherProfileId: string,
    @Body() body: ReplaceTeacherAssignmentsDto,
  ): Promise<TeacherAssignmentListResponseDto> {
    const user = currentUser(req);
    const assignments = await this.assignments.replaceForTeacher(
      user.schoolId,
      teacherProfileId,
      body,
      {
        actorUserId: user.userId,
        actorRole: resolveActorRole(user),
      },
    );
    return { assignments };
  }

  // F6 gap-closure (2026-08-28): a class-centric teacher list — the only
  // prior lookup was per-teacher (`GET /teachers/:id/assignments` above).
  // Same permission as StudentEnrollmentController's own class-roster route,
  // which this mirrors.
  @Get('classes/:id/teachers')
  @Authorized('assignments.view')
  @ApiOperation({ summary: "A class's currently assigned teachers, by subject." })
  @ApiOkResponse({ type: ClassTeachersResponseDto })
  async teachersForClass(
    @Req() req: FastifyRequest,
    @Param('id') classId: string,
  ): Promise<ClassTeachersResponseDto> {
    const teachers = await this.assignments.listForClass(currentUser(req).schoolId, classId);
    return { teachers };
  }
}
