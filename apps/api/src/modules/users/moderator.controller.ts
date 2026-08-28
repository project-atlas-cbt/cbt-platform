import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { resolveActorRole } from '../academics/actor.util.js';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import {
  CreateModeratorDto,
  ListModeratorsQueryDto,
  ModeratorListResponseDto,
  ModeratorResponseDto,
  UpdateModeratorDto,
} from './dto/moderator.dto.js';
import { ModeratorService } from './moderator.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('people')
@Controller('moderators')
export class ModeratorController {
  constructor(private readonly moderators: ModeratorService) {}

  @Get()
  @Authorized('users.moderator.view')
  @ApiOperation({
    summary:
      "List the school's moderators (05 §14) — School Admin only; search, sort, pagination " +
      '(F7 gap closure).',
  })
  @ApiOkResponse({ type: ModeratorListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Query() query: ListModeratorsQueryDto,
  ): Promise<ModeratorListResponseDto> {
    return this.moderators.list(currentUser(req).schoolId, query);
  }

  @Get(':id')
  @Authorized('users.moderator.view')
  @ApiOperation({ summary: 'Get one moderator.' })
  @ApiOkResponse({ type: ModeratorResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string): Promise<ModeratorResponseDto> {
    return this.moderators.get(currentUser(req).schoolId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('users.moderator.create')
  @ApiOperation({ summary: 'Create a moderator (dispatches an invitation email).' })
  @ApiOkResponse({ type: ModeratorResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateModeratorDto,
  ): Promise<ModeratorResponseDto> {
    const user = currentUser(req);
    return this.moderators.create(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch(':id')
  @Authorized('users.moderator.edit')
  @ApiOperation({ summary: 'Edit a moderator.' })
  @ApiOkResponse({ type: ModeratorResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateModeratorDto,
  ): Promise<ModeratorResponseDto> {
    const user = currentUser(req);
    return this.moderators.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Post(':id/remove')
  @HttpCode(HttpStatus.OK)
  @Authorized('users.moderator.remove')
  @ApiOperation({
    summary: "Remove a moderator's access (ends their role and deactivates the account).",
  })
  @ApiOkResponse({ type: ModeratorResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<ModeratorResponseDto> {
    const user = currentUser(req);
    return this.moderators.remove(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }
}
