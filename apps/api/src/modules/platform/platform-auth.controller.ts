import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { PlatformMfaService } from './mfa/platform-mfa.service.js';
import { AllowMfaEnrolmentPending, AllowPlatformPasswordChangePending } from './mfa/decorators.js';
import { PlatformPasswordChangeDto } from './dto/platform-password-change.dto.js';
import {
  MfaCodeDto,
  MfaEnrolmentConfirmResponseDto,
  MfaEnrolmentStartResponseDto,
  MfaRecoveryDto,
  MfaResetDto,
  MfaStatusResponseDto,
  MfaVerifyDto,
  PlatformLoginResponseDto,
} from './mfa/mfa.dto.js';
import { RateLimitClass } from '../../security/rate-limit.js';

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
    private readonly mfa: PlatformMfaService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('auth')
  @PublicRoute(
    'Pre-authentication by definition — this is what establishes a Software Admin session.',
  )
  @ApiOperation({
    summary:
      "Authenticate as Software Admin (ADR-0005's distinct platform host). B20: returns mfa_required + a challenge token, and no session, when a second factor is enrolled.",
  })
  @ApiOkResponse({ type: PlatformLoginResponseDto })
  async login(
    @Body() body: PlatformLoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<PlatformLoginResponseDto> {
    return this.platformAuth.login(body.email, body.password, res, req);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('auth')
  @PublicRoute('Login step 2 — authorized by the single-use challenge token from step 1.')
  @ApiOperation({ summary: 'B20: complete Software Admin sign-in with a TOTP code.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async verifyMfa(
    @Body() body: MfaVerifyDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StatusResponseDto> {
    await this.platformAuth.completeMfa(body.challengeToken, { otp: body.otp }, res, req);
    return { status: 'ok' as const };
  }

  @Post('mfa/recovery')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('auth')
  @PublicRoute('Login step 2 — authorized by the single-use challenge token from step 1.')
  @ApiOperation({
    summary: 'B20: complete Software Admin sign-in with a single-use recovery code.',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async recoverMfa(
    @Body() body: MfaRecoveryDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StatusResponseDto> {
    await this.platformAuth.completeMfa(
      body.challengeToken,
      { recoveryCode: body.recoveryCode },
      res,
      req,
    );
    return { status: 'ok' as const };
  }

  @Get('mfa')
  @AuthorizedPlatform('identity.mfa.manage')
  @AllowMfaEnrolmentPending()
  @AllowPlatformPasswordChangePending()
  @ApiOperation({ summary: "B20: the current Software Admin's second-factor status." })
  @ApiOkResponse({ type: MfaStatusResponseDto })
  async mfaStatus(@Req() req: FastifyRequest): Promise<MfaStatusResponseDto> {
    return this.mfa.status(currentPlatformUser(req).userId);
  }

  @Post('mfa/enrol')
  @HttpCode(HttpStatus.OK)
  @AuthorizedPlatform('identity.mfa.manage')
  @AllowMfaEnrolmentPending()
  @AllowPlatformPasswordChangePending()
  @ApiOperation({ summary: 'B20: start TOTP enrolment — returns the secret and otpauth URI.' })
  @ApiOkResponse({ type: MfaEnrolmentStartResponseDto })
  async startEnrolment(@Req() req: FastifyRequest): Promise<MfaEnrolmentStartResponseDto> {
    return this.mfa.startEnrolment(currentPlatformUser(req).userId);
  }

  @Post('mfa/enrol/confirm')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('auth')
  @AuthorizedPlatform('identity.mfa.manage')
  @AllowMfaEnrolmentPending()
  @AllowPlatformPasswordChangePending()
  @ApiOperation({
    summary:
      'B20: confirm enrolment with a first code; returns the recovery codes (shown once). Ends every other session.',
  })
  @ApiOkResponse({ type: MfaEnrolmentConfirmResponseDto })
  async confirmEnrolment(
    @Req() req: FastifyRequest,
    @Body() body: MfaCodeDto,
  ): Promise<MfaEnrolmentConfirmResponseDto> {
    const user = currentPlatformUser(req);
    return this.mfa.confirmEnrolment(user.userId, body.otp, user.sessionId);
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('auth')
  @AuthorizedPlatform('identity.mfa.manage')
  @ApiOperation({ summary: 'B20: remove own second factor — requires a current code.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async disableMfa(
    @Req() req: FastifyRequest,
    @Body() body: MfaCodeDto,
  ): Promise<StatusResponseDto> {
    const user = currentPlatformUser(req);
    await this.mfa.disable(user.userId, body.otp, user.sessionId);
    return { status: 'ok' as const };
  }

  @Post('mfa/reset')
  @HttpCode(HttpStatus.OK)
  @AuthorizedPlatform('platform.admin.resetMfa')
  @ApiOperation({
    summary:
      "B20: clear another Software Admin's lost second factor (reason required, audited; ends their sessions).",
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async resetMfa(
    @Req() req: FastifyRequest,
    @Body() body: MfaResetDto,
  ): Promise<StatusResponseDto> {
    await this.mfa.resetForAdmin(currentPlatformUser(req).userId, body.userId, body.reason);
    return { status: 'ok' as const };
  }

  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('auth')
  @AuthorizedPlatform('account.resetOwnPassword')
  @AllowPlatformPasswordChangePending()
  @ApiOperation({
    summary:
      'Change own Software Admin password (current password required). Ends every other session and emails a notice.',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async changePassword(
    @Req() req: FastifyRequest,
    @Body() body: PlatformPasswordChangeDto,
  ): Promise<StatusResponseDto> {
    const user = currentPlatformUser(req);
    await this.platformAuth.changePassword(
      user.userId,
      user.sessionId,
      body.currentPassword,
      body.newPassword,
    );
    return { status: 'ok' as const };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @AuthorizedPlatform('identity.session.manage')
  @AllowMfaEnrolmentPending()
  @AllowPlatformPasswordChangePending()
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
  @AllowMfaEnrolmentPending()
  @AllowPlatformPasswordChangePending()
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
