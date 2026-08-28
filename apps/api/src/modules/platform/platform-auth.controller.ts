import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthorizedPlatform, PublicRoute } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { MePermissionsResponseDto } from '../authorization/dto/me-permissions-response.dto.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { type AuthenticatedPlatformUser } from '../identity/auth.guard.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformLoginDto } from './dto/platform-login.dto.js';
import { PlatformMeResponseDto } from './dto/platform-me-response.dto.js';

// Same tighter-than-baseline throttle as identity.controller.ts's
// AUTH_THROTTLE — this endpoint is unauthenticated by definition and
// therefore brute-forceable.
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

function currentPlatformUser(req: FastifyRequest): AuthenticatedPlatformUser {
  // Safe: every route here reading this is behind @AuthorizedPlatform(...),
  // which runs PlatformAuthGuard before the handler — same non-null
  // assertion pattern as identity.controller.ts's currentUser().
  return req.user as AuthenticatedPlatformUser;
}

@ApiTags('platform')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly platformAuth: PlatformAuthService,
    private readonly authz: AuthorizationService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  @PublicRoute(
    'Pre-authentication by definition — this is what establishes a Software Admin session.',
  )
  @ApiOperation({ summary: "Authenticate as Software Admin (ADR-0005's distinct platform host)." })
  @ApiOkResponse({ type: StatusResponseDto })
  async login(
    @Body() body: PlatformLoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StatusResponseDto> {
    await this.platformAuth.login(body.email, body.password, res, req);
    return { status: 'ok' as const };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @AuthorizedPlatform('identity.session.manage')
  @ApiOperation({ summary: 'Revoke the current Software Admin session.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StatusResponseDto> {
    const user = currentPlatformUser(req);
    await this.platformAuth.logout(user.sessionId, res);
    return { status: 'ok' as const };
  }

  @Get('me')
  @AuthorizedPlatform('identity.me.read')
  @ApiOperation({
    summary: 'Current Software Admin identity and roles — read live from the database.',
  })
  @ApiOkResponse({ type: PlatformMeResponseDto })
  async me(@Req() req: FastifyRequest): Promise<PlatformMeResponseDto> {
    const user = currentPlatformUser(req);
    return this.platformAuth.me(user.userId);
  }

  /**
   * The platform-scoped analog of `GET /v1/me/permissions` — a real gap
   * found by live browser testing, not planned in any phase: that route is
   * `@Authorized(...)`, wired exclusively to the school `AuthGuard`, so a
   * Software Admin session (which has no `SchoolMembership`/tenant at all)
   * could never reach it — every load of the Platform Admin shell's
   * `RoleNavigation` 401'd on `/me/permissions` forever, leaving the
   * sidebar stuck on its loading skeleton. `AuthorizationService
   * .effectivePermissions()` was already actor-kind-agnostic (B3's
   * `actorFromAuthenticatedUser` already branches `PLATFORM`/`SCHOOL`), and
   * `identity.permissions.read`'s own permission-table row already grants
   * `SOFTWARE_ADMIN: granted('SELF')` (B2's row comment: "not an explicit
   * 02 row" — anticipating exactly this kind of platform-reachable use) —
   * the only missing piece was a route wired through `@AuthorizedPlatform`
   * instead of `@Authorized`. No schema, no permission-table, no ADR
   * change: purely an additive route reusing existing, already-graded
   * logic.
   */
  @Get('permissions')
  @AuthorizedPlatform('identity.permissions.read')
  @ApiOperation({
    summary:
      'The effective capability set for the current Software Admin session — platform-scoped analog of GET /me/permissions.',
  })
  @ApiOkResponse({ type: MePermissionsResponseDto })
  permissions(@Req() req: FastifyRequest): MePermissionsResponseDto {
    const actor = actorFromAuthenticatedUser(req.user!);
    return {
      roles: actor.roles,
      permissions: this.authz.effectivePermissions(actor),
    };
  }
}
