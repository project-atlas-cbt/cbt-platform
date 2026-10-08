import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppHttpException } from '../../common/app-http-exception.js';
import { TenancyContextService } from '../../common/tenancy-context.service.js';
import { RateLimitClass } from '../../security/rate-limit.js';
import { Authorized, PublicRoute } from '../authorization/decorators.js';
import { type AuthenticatedUser } from './auth.guard.js';
import { StudentPasswordlessService } from './student-passwordless.service.js';
import {
  StudentPasswordlessSettingsDto,
  StudentSignInDto,
} from './dto/student-passwordless.dto.js';
import { StatusResponseDto } from './dto/status-response.dto.js';

/** Passwordless student sign-in (owner decision 2026-10-08) — see
 * `StudentPasswordlessService`. */
@ApiTags('identity')
@Controller()
export class StudentPasswordlessController {
  constructor(
    private readonly passwordless: StudentPasswordlessService,
    private readonly tenancy: TenancyContextService,
  ) {}

  @Post('auth/student-sign-in')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('auth')
  @PublicRoute('Pre-authentication by definition — this is what establishes a session.')
  @ApiOperation({
    summary:
      "Student sign-in with Login ID + name, only while the school or the student's class has it switched on.",
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async signIn(
    @Body() body: StudentSignInDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StatusResponseDto> {
    const schoolId = this.tenancy.schoolId;
    if (!schoolId) {
      throw new AppHttpException({
        code: 'UNAUTHENTICATED',
        message: 'No school could be resolved for this request.',
      });
    }
    await this.passwordless.signIn(schoolId, body.identifier, body.name, res, req);
    return { status: 'ok' as const };
  }

  @Get('school/student-passwordless-sign-in')
  @Authorized('users.student.resetCredentials')
  @ApiOperation({ summary: 'Where students may currently sign in without a password.' })
  @ApiOkResponse({ type: StudentPasswordlessSettingsDto })
  async getSettings(@Req() req: FastifyRequest): Promise<StudentPasswordlessSettingsDto> {
    return this.passwordless.getSettings((req.user as AuthenticatedUser).schoolId);
  }

  @Put('school/student-passwordless-sign-in')
  @Authorized('users.student.resetCredentials')
  @ApiOperation({
    summary:
      'Switch passwordless student sign-in on or off for the school or chosen classes (School Admin, Moderator). Switching off signs those students out.',
  })
  @ApiOkResponse({ type: StudentPasswordlessSettingsDto })
  async updateSettings(
    @Req() req: FastifyRequest,
    @Body() body: StudentPasswordlessSettingsDto,
  ): Promise<StudentPasswordlessSettingsDto> {
    const user = req.user as AuthenticatedUser;
    return this.passwordless.updateSettings(user.schoolId, user, body);
  }
}
