import { Controller, Get, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { AcademicsContextService } from './academics-context.service.js';
import { AcademicsContextResponseDto } from './dto/academics-context.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('academics')
@Controller('academics')
export class AcademicsContextController {
  constructor(private readonly context: AcademicsContextService) {}

  @Get('context')
  @Authorized('academics.context.view')
  @ApiOperation({
    summary: 'Current school + session + term (04 §66 context switcher), every role.',
  })
  @ApiOkResponse({ type: AcademicsContextResponseDto })
  async get(@Req() req: FastifyRequest): Promise<AcademicsContextResponseDto> {
    return this.context.get(currentUser(req).schoolId);
  }
}
