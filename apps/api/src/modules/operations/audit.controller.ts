import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditListResponseDto, AuditQueryDto } from './dto/audit.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** `GET /v1/audit` — B10. Scoped per role: Software Admin/School Admin/
 * Moderator full school read, HOD department (+ own actions), Teacher/
 * Student own actions/account only. See `AuditQueryService`'s own doc
 * comment for the full per-role scoping design. */
@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @Authorized('audit.viewLog')
  @ApiOperation({
    summary: 'Scoped audit retrieval — filters: actor, action, entity type, date range (B10).',
  })
  @ApiOkResponse({ type: AuditListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Query() query: AuditQueryDto,
  ): Promise<AuditListResponseDto> {
    const user = currentUser(req);
    return this.audit.list(user.schoolId, actorFromAuthenticatedUser(user), query);
  }
}
