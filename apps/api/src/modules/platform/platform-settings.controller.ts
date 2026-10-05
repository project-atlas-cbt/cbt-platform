import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthorizedPlatform } from '../authorization/decorators.js';
import { type AuthenticatedPlatformUser } from '../identity/auth.guard.js';
import { RateLimitClass } from '../../security/rate-limit.js';
import { PlatformSettingsAdminService } from './platform-settings-admin.service.js';
import {
  PlatformSettingsResponseDto,
  TestEmailResponseDto,
  UpdatePlatformSettingsDto,
} from './dto/platform-settings.dto.js';

/** ADR-0036 — the Software Admin's System Configuration. */
@ApiTags('platform')
@Controller('platform/settings')
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsAdminService) {}

  @Get()
  @AuthorizedPlatform('platform.settings.view')
  @ApiOperation({ summary: 'ADR-0036: editable platform settings, their limits and sources.' })
  @ApiOkResponse({ type: PlatformSettingsResponseDto })
  list(): Promise<PlatformSettingsResponseDto> {
    return this.settings.list();
  }

  @Patch()
  @AuthorizedPlatform('platform.settings.manage')
  @ApiOperation({
    summary:
      'ADR-0036: change or reset platform settings (reason required; audited; other Software Admins emailed).',
  })
  @ApiOkResponse({ type: PlatformSettingsResponseDto })
  update(
    @Req() req: FastifyRequest,
    @Body() body: UpdatePlatformSettingsDto,
  ): Promise<PlatformSettingsResponseDto> {
    const user = req.user as AuthenticatedPlatformUser;
    return this.settings.update(user.userId, body.changes, body.reason);
  }

  @Post('test-email')
  @HttpCode(HttpStatus.OK)
  @RateLimitClass('heavy')
  @AuthorizedPlatform('platform.settings.manage')
  @ApiOperation({ summary: 'ADR-0036: email the signed-in admin using the settings in effect.' })
  @ApiOkResponse({ type: TestEmailResponseDto })
  sendTestEmail(@Req() req: FastifyRequest): Promise<TestEmailResponseDto> {
    return this.settings.sendTestEmail((req.user as AuthenticatedPlatformUser).userId);
  }
}
