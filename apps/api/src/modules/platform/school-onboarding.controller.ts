import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { SchoolOnboardingService } from './school-onboarding.service.js';
import {
  OnboardingStatusResponseDto,
  UpdateOnboardingProgressDto,
} from './dto/school-onboarding.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `GET/PUT /v1/school/onboarding`, `POST /v1/school/onboarding/complete`
 * (F4) — sibling to `SchoolProfileController`/`SchoolBrandingController`
 * under the same `/v1/school/*` self-service surface. See
 * `SchoolOnboardingService`'s doc comment for the gap this closes.
 */
@ApiTags('school')
@Controller('school/onboarding')
export class SchoolOnboardingController {
  constructor(private readonly onboarding: SchoolOnboardingService) {}

  @Get()
  @Authorized('schoolConfig.onboarding.manage')
  @ApiOperation({ summary: "The caller's own school's onboarding wizard progress." })
  @ApiOkResponse({ type: OnboardingStatusResponseDto })
  async getStatus(@Req() req: FastifyRequest): Promise<OnboardingStatusResponseDto> {
    return this.onboarding.getProgress(currentUser(req).schoolId);
  }

  @Put('progress')
  @Authorized('schoolConfig.onboarding.manage')
  @ApiOperation({ summary: 'Advance/update the onboarding wizard step pointer.' })
  @ApiOkResponse({ type: OnboardingStatusResponseDto })
  async updateProgress(
    @Req() req: FastifyRequest,
    @Body() body: UpdateOnboardingProgressDto,
  ): Promise<OnboardingStatusResponseDto> {
    return this.onboarding.updateProgress(currentUser(req).schoolId, body);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @Authorized('schoolConfig.onboarding.manage')
  @ApiOperation({
    summary: 'Mark onboarding complete (05 §5.2: requires a current session and a class).',
  })
  @ApiOkResponse({ type: OnboardingStatusResponseDto })
  async complete(@Req() req: FastifyRequest): Promise<OnboardingStatusResponseDto> {
    const user = currentUser(req);
    return this.onboarding.complete(user.schoolId, user.userId);
  }
}
