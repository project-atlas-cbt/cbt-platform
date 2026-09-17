import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { RequirePermission } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { AttemptAdministrationService } from '../execution/attempt-administration.service.js';
import { InvalidateAttemptDto } from '../execution/dto/participation.dto.js';
import type { AuthenticatedPlatformUser } from '../identity/auth.guard.js';
import { PlatformAuthGuard } from './platform-auth.guard.js';

function currentPlatformUser(req: FastifyRequest): AuthenticatedPlatformUser {
  return req.user as AuthenticatedPlatformUser;
}

/** Software Admin's explicit ADR-0012 break-glass path for invalidation.
 * PermissionGuard intentionally cannot grant BREAK_GLASS rows; the service
 * below verifies and audits the exceptional action through BreakGlassService. */
@ApiTags('platform')
@Controller('platform/schools/:schoolId')
export class PlatformAttemptAdministrationController {
  constructor(private readonly attempts: AttemptAdministrationService) {}

  @Post('attempts/:attemptId/invalidate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('examAdmin.invalidateAttempt')
  @UseGuards(PlatformAuthGuard)
  @ApiOperation({
    summary: 'Break-glass invalidate an attempt for a school; reason is mandatory and audited.',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async invalidate(
    @Req() req: FastifyRequest,
    @Param('schoolId') schoolId: string,
    @Param('attemptId') attemptId: string,
    @Body() body: InvalidateAttemptDto,
  ): Promise<StatusResponseDto> {
    const user = currentPlatformUser(req);
    await this.attempts.invalidateWithBreakGlass(
      schoolId,
      actorFromAuthenticatedUser(user),
      attemptId,
      body,
    );
    return { status: 'ok' };
  }
}
