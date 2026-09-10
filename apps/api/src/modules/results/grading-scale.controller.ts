import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { GradingScaleService } from './grading-scale.service.js';
import {
  GradingScaleListResponseDto,
  GradingScaleResponseDto,
  GradingScaleVersionListResponseDto,
  PutGradingScaleDto,
} from './dto/grading-scale.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** ADR-0018's configuration surface (05 §46, 04 §19). F5 shipped a
 * placeholder on the School Settings screen naming B15 as the phase that
 * would give it a real endpoint; this is it. */
@ApiTags('grading-scales')
@Controller('school/grading-scales')
export class GradingScaleController {
  constructor(private readonly scales: GradingScaleService) {}

  @Get()
  @Authorized('schoolConfig.settings.view')
  @ApiOperation({
    summary:
      "The school's grading scales with their current bands, plus the platform default template offered as a starting point.",
  })
  @ApiOkResponse({ type: GradingScaleListResponseDto })
  async list(@Req() req: FastifyRequest): Promise<GradingScaleListResponseDto> {
    const user = currentUser(req);
    return this.scales.list(user.schoolId, actorFromAuthenticatedUser(user));
  }

  @Put()
  @Authorized('schoolConfig.settings.manage')
  @ApiOperation({
    summary:
      'Create a scale, or add a version to an existing one. Never an in-place band edit — ADR-0018 versions instead, so historical grades stay explainable.',
  })
  @ApiOkResponse({ type: GradingScaleResponseDto })
  async put(
    @Req() req: FastifyRequest,
    @Body() body: PutGradingScaleDto,
  ): Promise<GradingScaleResponseDto> {
    const user = currentUser(req);
    return this.scales.put(user.schoolId, actorFromAuthenticatedUser(user), body, {
      actorUserId: user.userId,
    });
  }

  @Get(':id/versions')
  @Authorized('schoolConfig.settings.view')
  @ApiOperation({
    summary:
      'Every version of a scale, newest first, each flagged with whether any result was graded against it (ADR-0018: make versioning visible).',
  })
  @ApiOkResponse({ type: GradingScaleVersionListResponseDto })
  async listVersions(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<GradingScaleVersionListResponseDto> {
    const user = currentUser(req);
    return this.scales.listVersions(user.schoolId, actorFromAuthenticatedUser(user), id);
  }
}
