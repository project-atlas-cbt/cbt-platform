import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { resolveActorRole } from './actor.util.js';
import { HodAssignmentService } from './hod-assignment.service.js';
import {
  CreateHodAssignmentDto,
  HodAssignmentListResponseDto,
  HodAssignmentResponseDto,
} from './dto/hod-assignment.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('academics')
@Controller('academics')
export class HodAssignmentController {
  constructor(private readonly hodAssignments: HodAssignmentService) {}

  // Gated by schoolConfig.department.view rather than the DEPARTMENT-scoped
  // assignments.view (still awaiting B6's TeacherAssignment/Enrollment, and
  // PermissionGuard never passes a ResourceContext today — see
  // department-scope.resolver.ts's own doc comment): HOD sees whole-school
  // visibility here, matching that permission's existing, already-reachable
  // grant shape exactly, not a not-yet-wired department-scoped one.
  @Get('departments/:id/hod-assignments')
  @Authorized('schoolConfig.department.view')
  @ApiOperation({ summary: "A department's HOD assignment history (07 §6.9)." })
  @ApiOkResponse({ type: HodAssignmentListResponseDto })
  async listForDepartment(
    @Req() req: FastifyRequest,
    @Param('id') departmentId: string,
  ): Promise<HodAssignmentListResponseDto> {
    const assignments = await this.hodAssignments.listForDepartment(
      currentUser(req).schoolId,
      departmentId,
    );
    return { assignments };
  }

  @Post('hod-assignments')
  @HttpCode(HttpStatus.CREATED)
  @Authorized('assignments.hodToDepartment')
  @ApiOperation({
    summary: 'Assign an HOD to a department (rejects a membership without an active HOD role).',
  })
  @ApiOkResponse({ type: HodAssignmentResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateHodAssignmentDto,
  ): Promise<HodAssignmentResponseDto> {
    const user = currentUser(req);
    return this.hodAssignments.create(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post('hod-assignments/:id/end')
  @HttpCode(HttpStatus.OK)
  @Authorized('assignments.hodToDepartment')
  @ApiOperation({ summary: 'End an HOD assignment (FR §13: "School Admin -> remove HOD").' })
  @ApiOkResponse({ type: HodAssignmentResponseDto })
  async end(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<HodAssignmentResponseDto> {
    const user = currentUser(req);
    return this.hodAssignments.end(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }
}
