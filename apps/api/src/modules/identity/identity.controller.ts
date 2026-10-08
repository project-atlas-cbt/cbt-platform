import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { TenancyContextService } from '../../common/tenancy-context.service.js';
import { createCsrfToken, PLATFORM_CSRF_USER_INFO } from '../../security/csrf.js';
import { IssuesCsrfToken } from '../../security/csrf.guard.js';
import { Authorized, PublicRoute } from '../authorization/decorators.js';
import { ObjectStorageService } from '../../storage/object-storage.service.js';
import { resolveLogoSignedUrl } from '../../storage/logo-resolver.js';
import { type AuthenticatedUser } from './auth.guard.js';
import { AllowPendingPasswordChange } from './decorators.js';
import { IdentityService } from './identity.service.js';
import { LoginDto } from './dto/login.dto.js';
import { PasswordChangeDto } from './dto/password-change.dto.js';
import { PasswordResetConfirmDto, PasswordResetRequestDto } from './dto/password-reset.dto.js';
import { MeResponseDto } from './dto/me-response.dto.js';
import { StatusResponseDto } from './dto/status-response.dto.js';
import { TenantResolveResponseDto } from './dto/tenant-resolve-response.dto.js';
import { RateLimitClass } from '../../security/rate-limit.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  // AuthGuard always sets this before a guarded handler runs; the
  // assertion is safe here specifically because every route in this
  // controller that reads it is behind @Authorized(...), which runs
  // AuthGuard (never PlatformAuthGuard) before PermissionGuard.
  return req.user as AuthenticatedUser;
}

@ApiTags('identity')
@Controller()
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly tenancy: TenancyContextService,
    private readonly storage: ObjectStorageService,
  ) {}

  /** ADR-0005: every route below except tenant/resolve needs a resolved
   * school to operate against — never a bare 500 when the caller hit the
   * platform host or an unrecognised subdomain instead. */
  private requireTenant(): string {
    const schoolId = this.tenancy.schoolId;
    if (!schoolId) {
      throw new AppHttpException({
        code: 'UNAUTHENTICATED',
        message: 'No school could be resolved for this request.',
      });
    }
    return schoolId;
  }

  @Get('tenant/resolve')
  // F20: the only route that persists a newly minted CSRF secret (csrf.guard.ts).
  @IssuesCsrfToken()
  @PublicRoute('Pre-authentication — resolves branding for the login screen itself (ADR-0005).')
  @ApiOperation({
    summary:
      "Resolve the current subdomain's school for pre-login branding (ADR-0005), plus a CSRF token.",
  })
  @ApiOkResponse({ type: TenantResolveResponseDto })
  async resolveTenant(@Req() req: FastifyRequest): Promise<TenantResolveResponseDto> {
    const schoolId = this.tenancy.schoolId;
    const row = schoolId
      ? await prisma.school.findUnique({
          where: { id: schoolId },
          select: {
            name: true,
            subdomain: true,
            timezone: true,
            logoMediaId: true,
            primaryColor: true,
            studentPasswordlessSignIn: true,
          },
        })
      : null;

    // B4: extends this response with branding rather than replacing it,
    // exactly as this file's own comment (and TenantBrandLine's on the
    // frontend) anticipated. getLogoSignedUrl never throws — a dangling/
    // superseded pointer degrades to "no logo shown," not a broken login
    // page.
    const school =
      row === null
        ? null
        : {
            name: row.name,
            subdomain: row.subdomain,
            timezone: row.timezone,
            logoUrl: row.logoMediaId
              ? await resolveLogoSignedUrl(this.storage, schoolId!, row.logoMediaId)
              : null,
            primaryColor: row.primaryColor,
            studentPasswordlessSignIn:
              row.studentPasswordlessSignIn ||
              (await withTenant(prisma, schoolId!, (tx) =>
                tx.classGroup.count({ where: { schoolId: schoolId!, passwordlessSignIn: true } }),
              )) > 0,
          };

    const csrfToken = createCsrfToken(req.csrfSecret!, schoolId ?? PLATFORM_CSRF_USER_INFO);
    return { school, csrfToken };
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('auth')
  @PublicRoute('Pre-authentication by definition — this is what establishes a session.')
  @ApiOperation({ summary: 'Authenticate within the resolved tenant (ADR-0005).' })
  @ApiOkResponse({ type: StatusResponseDto })
  async login(
    @Body() body: LoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StatusResponseDto> {
    const schoolId = this.requireTenant();
    await this.identity.login(schoolId, body.identifier, body.password, res, req);
    return { status: 'ok' as const };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  @Authorized('identity.session.manage')
  @ApiOperation({ summary: 'Revoke the current session.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.identity.logout(user.schoolId, user.sessionId, res);
    return { status: 'ok' as const };
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  @PublicRoute(
    "Operates on the raw session cookie directly (IdentityService.refresh) rather than through AuthGuard's active-membership check — must still work at the edges AuthGuard would reject.",
  )
  @ApiOperation({ summary: 'Rotate the current session (ADR-0022).' })
  @ApiOkResponse({ type: StatusResponseDto })
  async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StatusResponseDto> {
    const schoolId = this.requireTenant();
    await this.identity.refresh(req, res, schoolId);
    return { status: 'ok' as const };
  }

  @Get('auth/me')
  @Authorized('identity.me.read')
  @ApiOperation({ summary: 'Current user, membership, and roles — read live from the database.' })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@Req() req: FastifyRequest): Promise<MeResponseDto> {
    const user = currentUser(req);
    return {
      ...(await this.identity.me(user.schoolId, user.userId, user.membershipId)),
      passwordless: user.passwordless,
    };
  }

  @Post('auth/password/change')
  @HttpCode(HttpStatus.OK)
  @Authorized('account.resetOwnPassword')
  @AllowPendingPasswordChange()
  @ApiOperation({ summary: 'Authenticated password change — clears any forced-change state.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async changePassword(
    @Req() req: FastifyRequest,
    @Body() body: PasswordChangeDto,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    // Signed in with Login ID + name: whoever holds this session never
    // proved they know the account's password, so they may not set one.
    if (user.passwordless) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'Sign in with your password to change it.',
      });
    }
    await this.identity.changePassword(
      user.schoolId,
      user.userId,
      body.currentPassword,
      body.newPassword,
      { sessionId: user.sessionId, membershipId: user.membershipId },
    );
    return { status: 'ok' as const };
  }

  @Post('auth/password/reset/request')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('auth')
  @PublicRoute('Pre-authentication by definition — the caller has no session yet.')
  @ApiOperation({ summary: 'Initiate a staff password reset (ADR-0019 — students have no email).' })
  @ApiOkResponse({ type: StatusResponseDto })
  async requestPasswordReset(@Body() body: PasswordResetRequestDto): Promise<StatusResponseDto> {
    const schoolId = this.requireTenant();
    await this.identity.requestPasswordReset(schoolId, body.identifier);
    // Always the same shape, whether or not the identifier existed —
    // see IdentityService.requestPasswordReset's own comment.
    return { status: 'ok' as const };
  }

  @Post('auth/password/reset/confirm')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('auth')
  @PublicRoute(
    'Pre-authentication — authorized by the single-use reset token itself, not a session.',
  )
  @ApiOperation({ summary: 'Complete a password reset with a single-use token.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async confirmPasswordReset(@Body() body: PasswordResetConfirmDto): Promise<StatusResponseDto> {
    const schoolId = this.requireTenant();
    await this.identity.confirmPasswordReset(schoolId, body.token, body.newPassword);
    return { status: 'ok' as const };
  }
}
