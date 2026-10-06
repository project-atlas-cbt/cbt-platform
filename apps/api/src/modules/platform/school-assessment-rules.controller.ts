import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { SchoolAssessmentRulesService } from './school-assessment-rules.service.js';
import {
  SchoolAssessmentRulesResponseDto,
  UpdateSchoolAssessmentRulesDto,
} from './dto/school-assessment-rules.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** `GET/PUT /v1/school/assessment-rules` (05 §58) — see
 * `SchoolAssessmentRulesService`. */
@ApiTags('school')
@Controller('school/assessment-rules')
export class SchoolAssessmentRulesController {
  constructor(private readonly rules: SchoolAssessmentRulesService) {}

  @Get()
  @Authorized('schoolConfig.settings.view')
  @ApiOperation({ summary: "The caller's own school's default rules for new exams." })
  @ApiOkResponse({ type: SchoolAssessmentRulesResponseDto })
  async getAssessmentRules(@Req() req: FastifyRequest): Promise<SchoolAssessmentRulesResponseDto> {
    return this.rules.getAssessmentRules(currentUser(req).schoolId);
  }

  @Put()
  @Authorized('schoolConfig.settings.manage')
  @ApiOperation({ summary: 'Update the default rules for new exams (School Admin only).' })
  @ApiOkResponse({ type: SchoolAssessmentRulesResponseDto })
  async updateAssessmentRules(
    @Req() req: FastifyRequest,
    @Body() body: UpdateSchoolAssessmentRulesDto,
  ): Promise<SchoolAssessmentRulesResponseDto> {
    const user = currentUser(req);
    return this.rules.updateAssessmentRules(user.schoolId, user.userId, body);
  }
}
