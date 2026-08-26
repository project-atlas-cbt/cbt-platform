import { Controller, Get, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from './decorators.js';
import { actorFromAuthenticatedUser } from './permission.guard.js';
import { AuthorizationService } from './authorization.service.js';
import { MePermissionsResponseDto } from './dto/me-permissions-response.dto.js';

@ApiTags('authorization')
@Controller()
export class AuthorizationController {
  constructor(private readonly authz: AuthorizationService) {}

  @Get('me/permissions')
  @Authorized('identity.permissions.read')
  @ApiOperation({
    summary:
      'The effective capability set for the current user in the current school (B2). Presentation only — every real route is independently enforced by PermissionGuard.',
  })
  @ApiOkResponse({ type: MePermissionsResponseDto })
  me(@Req() req: FastifyRequest): MePermissionsResponseDto {
    // @Authorized() guarantees req.user is set before this handler runs.
    const actor = actorFromAuthenticatedUser(req.user!);
    return {
      roles: actor.roles,
      permissions: this.authz.effectivePermissions(actor),
    };
  }
}
