import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { SchoolProfileService } from './school-profile.service.js';
import {
  SchoolProfileResponseDto,
  SchoolSubscriptionStatusResponseDto,
  UpdateSchoolProfileDto,
} from './dto/school-profile.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('school')
@Controller('school')
export class SchoolProfileController {
  constructor(private readonly profile: SchoolProfileService) {}

  @Get('profile')
  @Authorized('schoolConfig.profile.view')
  @ApiOperation({ summary: "The caller's own school profile (03 §4 Step 1)." })
  @ApiOkResponse({ type: SchoolProfileResponseDto })
  async getProfile(@Req() req: FastifyRequest): Promise<SchoolProfileResponseDto> {
    return this.profile.getProfile(currentUser(req).schoolId);
  }

  @Patch('profile')
  @Authorized('schoolConfig.profile.edit')
  @ApiOperation({ summary: "Update the caller's own school profile (School Admin only)." })
  @ApiOkResponse({ type: SchoolProfileResponseDto })
  async updateProfile(
    @Req() req: FastifyRequest,
    @Body() body: UpdateSchoolProfileDto,
  ): Promise<SchoolProfileResponseDto> {
    return this.profile.updateProfile(currentUser(req).schoolId, body);
  }

  @Get('subscription')
  @Authorized('subscription.view')
  @ApiOperation({ summary: 'Read-only subscription status (05 §4.1) — School Admin/Moderator.' })
  @ApiOkResponse({ type: SchoolSubscriptionStatusResponseDto })
  async getSubscription(@Req() req: FastifyRequest): Promise<SchoolSubscriptionStatusResponseDto> {
    return this.profile.getSubscription(currentUser(req).schoolId);
  }
}
