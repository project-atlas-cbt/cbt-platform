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
import { DepartmentService } from './department.service.js';
import {
  CreateDepartmentDto,
  DepartmentListResponseDto,
  DepartmentResponseDto,
  UpdateDepartmentDto,
} from './dto/department.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('academics')
@Controller('academics/departments')
export class DepartmentController {
  constructor(private readonly departments: DepartmentService) {}

  @Get()
  @Authorized('schoolConfig.department.view')
  @ApiOperation({ summary: "List the school's departments (07 §6.3)." })
  @ApiOkResponse({ type: DepartmentListResponseDto })
  async list(@Req() req: FastifyRequest): Promise<DepartmentListResponseDto> {
    const user = currentUser(req);
    const departments = await this.departments.list(user.schoolId, user.membershipId);
    return { departments };
  }

  @Get(':id')
  @Authorized('schoolConfig.department.view')
  @ApiOperation({ summary: 'Get one department.' })
  @ApiOkResponse({ type: DepartmentResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string): Promise<DepartmentResponseDto> {
    return this.departments.get(currentUser(req).schoolId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('schoolConfig.department.manage')
  @ApiOperation({ summary: 'Create a department.' })
  @ApiOkResponse({ type: DepartmentResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateDepartmentDto,
  ): Promise<DepartmentResponseDto> {
    const user = currentUser(req);
    return this.departments.create(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch(':id')
  @Authorized('schoolConfig.department.manage')
  @ApiOperation({ summary: 'Edit a department.' })
  @ApiOkResponse({ type: DepartmentResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateDepartmentDto,
  ): Promise<DepartmentResponseDto> {
    const user = currentUser(req);
    return this.departments.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Authorized('schoolConfig.department.manage')
  @ApiOperation({ summary: 'Deactivate a department (FR AC-03) — always allowed.' })
  @ApiOkResponse({ type: DepartmentResponseDto })
  async deactivate(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<DepartmentResponseDto> {
    const user = currentUser(req);
    return this.departments.deactivate(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Delete(':id')
  @Authorized('schoolConfig.department.manage')
  @ApiOperation({
    summary: 'Hard-delete a department (blocked if subjects/classes/HOD assignments exist).',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.departments.delete(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
    return { status: 'ok' };
  }
}
