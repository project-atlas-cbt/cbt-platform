import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { resolveActorRole } from './actor.util.js';
import {
  ApplyStandardSetupDto,
  StandardSetupPreviewResponseDto,
  StandardSetupResultResponseDto,
} from './dto/standard-setup.dto.js';
import { StandardSetupService } from './standard-setup.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** ADR-0038 amendment — the standard setup. It mostly creates subjects, so
 * it uses the subject permissions; the department and class rows it also
 * touches grant School Admin and Moderator the same SCHOOL scope. */
@ApiTags('academics')
@Controller('academics/standard-setup')
export class StandardSetupController {
  constructor(private readonly standardSetup: StandardSetupService) {}

  @Get()
  @Authorized('schoolConfig.subject.view')
  @ApiOperation({ summary: 'What applying the standard setup would add or place (ADR-0038).' })
  @ApiOkResponse({ type: StandardSetupPreviewResponseDto })
  async preview(@Req() req: FastifyRequest): Promise<StandardSetupPreviewResponseDto> {
    return this.standardSetup.preview(currentUser(req).schoolId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Authorized('schoolConfig.subject.manage')
  @ApiOperation({ summary: 'Apply the ticked parts of the standard setup.' })
  @ApiOkResponse({ type: StandardSetupResultResponseDto })
  async apply(
    @Req() req: FastifyRequest,
    @Body() body: ApplyStandardSetupDto,
  ): Promise<StandardSetupResultResponseDto> {
    const user = currentUser(req);
    return this.standardSetup.apply(user.schoolId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }
}
