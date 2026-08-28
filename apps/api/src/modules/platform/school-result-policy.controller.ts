import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { SchoolResultPolicyService } from './school-result-policy.service.js';
import {
  SchoolResultPolicyResponseDto,
  UpdateSchoolResultPolicyDto,
} from './dto/school-result-policy.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `GET/PUT /v1/school/result-policy` (05 §47, ADR-0010) — sibling to
 * `SchoolProfileController`/`SchoolBrandingController` under the same
 * `/v1/school/*` self-service surface. See `SchoolResultPolicyService`'s
 * doc comment for what this does and does not enforce yet.
 */
@ApiTags('school')
@Controller('school/result-policy')
export class SchoolResultPolicyController {
  constructor(private readonly resultPolicy: SchoolResultPolicyService) {}

  @Get()
  @Authorized('schoolConfig.settings.view')
  @ApiOperation({ summary: "The caller's own school's result-publication defaults and lock flag." })
  @ApiOkResponse({ type: SchoolResultPolicyResponseDto })
  async getResultPolicy(@Req() req: FastifyRequest): Promise<SchoolResultPolicyResponseDto> {
    return this.resultPolicy.getResultPolicy(currentUser(req).schoolId);
  }

  @Put()
  @Authorized('schoolConfig.settings.manage')
  @ApiOperation({
    summary: 'Update result-publication defaults and the override lock (School Admin only).',
  })
  @ApiOkResponse({ type: SchoolResultPolicyResponseDto })
  async updateResultPolicy(
    @Req() req: FastifyRequest,
    @Body() body: UpdateSchoolResultPolicyDto,
  ): Promise<SchoolResultPolicyResponseDto> {
    const user = currentUser(req);
    return this.resultPolicy.updateResultPolicy(user.schoolId, user.userId, body);
  }
}
