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
  CreateStreamDto,
  StreamListResponseDto,
  StreamResponseDto,
  UpdateStreamDto,
} from './dto/stream.dto.js';
import { StreamService } from './stream.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** ADR-0038 — student streams. They belong to the class structure, so
 * they share the class permissions. */
@ApiTags('academics')
@Controller('academics/streams')
export class StreamController {
  constructor(private readonly streams: StreamService) {}

  @Get()
  @Authorized('schoolConfig.class.view')
  @ApiOperation({ summary: "List the school's student streams (ADR-0038)." })
  @ApiOkResponse({ type: StreamListResponseDto })
  async list(@Req() req: FastifyRequest): Promise<StreamListResponseDto> {
    return { streams: await this.streams.list(currentUser(req).schoolId) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('schoolConfig.class.manage')
  @ApiOperation({ summary: 'Create a stream.' })
  @ApiOkResponse({ type: StreamResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateStreamDto,
  ): Promise<StreamResponseDto> {
    const user = currentUser(req);
    return this.streams.create(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Patch(':id')
  @Authorized('schoolConfig.class.manage')
  @ApiOperation({ summary: 'Rename a stream, or retire it (status INACTIVE).' })
  @ApiOkResponse({ type: StreamResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateStreamDto,
  ): Promise<StreamResponseDto> {
    const user = currentUser(req);
    return this.streams.update(user.schoolId, id, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Delete(':id')
  @Authorized('schoolConfig.class.manage')
  @ApiOperation({ summary: 'Delete a stream that no class, student or offering uses.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.streams.remove(user.schoolId, id, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
    return { status: 'ok' };
  }
}
