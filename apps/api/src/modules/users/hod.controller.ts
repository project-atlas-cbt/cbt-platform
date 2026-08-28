import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { resolveActorRole } from '../academics/actor.util.js';
import { ReassignHodDepartmentDto } from '../academics/dto/hod-assignment.dto.js';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import {
  HodListResponseDto,
  HodResponseDto,
  ListHodsQueryDto,
  PromoteHodDto,
  UpdateHodDto,
} from './dto/hod.dto.js';
import { HodService } from './hod.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('people')
@Controller('hods')
export class HodController {
  constructor(private readonly hods: HodService) {}

  @Get()
  @Authorized('users.hod.view')
  @ApiOperation({
    summary: "List the school's HODs (05 §13) — search, sort, pagination (F7 gap closure).",
  })
  @ApiOkResponse({ type: HodListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Query() query: ListHodsQueryDto,
  ): Promise<HodListResponseDto> {
    return this.hods.list(currentUser(req).schoolId, query);
  }

  @Get(':id')
  @Authorized('users.hod.view')
  @ApiOperation({ summary: 'Get one HOD (route :id is the membershipId).' })
  @ApiOkResponse({ type: HodResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string): Promise<HodResponseDto> {
    return this.hods.get(currentUser(req).schoolId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('users.hod.create')
  @ApiOperation({
    summary:
      'Promote an existing teacher to HOD (adds an HOD RoleAssignment to their membership — ' +
      'no new person record is created).',
  })
  @ApiOkResponse({ type: HodResponseDto })
  async promote(@Req() req: FastifyRequest, @Body() body: PromoteHodDto): Promise<HodResponseDto> {
    const user = currentUser(req);
    return this.hods.promote(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch(':id')
  @Authorized('users.hod.edit')
  @ApiOperation({
    summary:
      "Edit an HOD's identity fields (F7 decision C — a dedicated HOD route, not a " +
      'silent call into the Teacher endpoint).',
  })
  @ApiOkResponse({ type: HodResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateHodDto,
  ): Promise<HodResponseDto> {
    const user = currentUser(req);
    return this.hods.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/reset-credentials')
  @HttpCode(HttpStatus.OK)
  @Authorized('users.hod.resetCredentials')
  @ApiOperation({
    summary: 'Send an HOD a fresh invitation link to set a new password (audited).',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async resetCredentials(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    return this.hods.resetCredentials(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Put(':id/department')
  @Authorized('assignments.hodToDepartment')
  @ApiOperation({
    summary:
      "Set (or change) an HOD's department — ends the current HODAssignment (if any) and " +
      'creates the new one atomically; prior approvals stay attributed to the previous HOD ' +
      '(DoD item 7).',
  })
  @ApiOkResponse({ type: HodResponseDto })
  async setDepartment(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: ReassignHodDepartmentDto,
  ): Promise<HodResponseDto> {
    const user = currentUser(req);
    return this.hods.setDepartment(user.schoolId, id, body.departmentId, body.academicSessionId, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/remove')
  @HttpCode(HttpStatus.OK)
  @Authorized('users.hod.remove')
  @ApiOperation({
    summary:
      'Remove HOD standing — the person reverts to a plain teacher; nothing they ' +
      'authored or approved is affected.',
  })
  @ApiOkResponse({ type: HodResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<HodResponseDto> {
    const user = currentUser(req);
    return this.hods.remove(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }
}
