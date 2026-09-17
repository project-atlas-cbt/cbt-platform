import { Controller, Delete, HttpCode, HttpStatus, Param, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { resolveExamActorRole } from '../exams/actor.util.js';
import { AttemptAdministrationService } from './attempt-administration.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** Canonical B16 authorization revocation endpoint plus the temporary
 * roadmap compatibility alias. Revocation is a state transition; neither
 * route deletes an authorization or its academic evidence. */
@ApiTags('attempt-authorizations')
@Controller()
export class AttemptAuthorizationController {
  constructor(private readonly administration: AttemptAdministrationService) {}

  @Delete('attempt-authorizations/:id')
  @HttpCode(HttpStatus.OK)
  @Authorized('examAdmin.grantMakeup')
  async revoke(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.administration.revoke(user.schoolId, actorFromAuthenticatedUser(user), id, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
    return { status: 'ok' };
  }

  @Delete('makeup-authorizations/:id')
  @HttpCode(HttpStatus.OK)
  @Authorized('examAdmin.grantMakeup')
  async revokeLegacy(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<StatusResponseDto> {
    return this.revoke(req, id);
  }
}
