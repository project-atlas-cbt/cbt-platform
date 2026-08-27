import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { SchoolBrandingService } from './school-branding.service.js';
import {
  RequestLogoUploadDto,
  SchoolBrandingResponseDto,
  UpdateSchoolBrandingDto,
} from './dto/school-branding.dto.js';
import {
  MediaAssetSummaryResponseDto,
  RequestMediaUploadResponseDto,
} from '../media/dto/media.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `GET/PUT /v1/school/branding` (03 §5, 05 §6.1) plus the logo's own
 * upload-target/complete pair — sibling to `SchoolProfileController`
 * under the same `/v1/school/*` self-service surface. See
 * `SchoolBrandingService`'s doc comment for why logo upload doesn't go
 * through the generic `MediaController` endpoints.
 */
@ApiTags('school')
@Controller('school/branding')
export class SchoolBrandingController {
  constructor(private readonly branding: SchoolBrandingService) {}

  @Post('logo/upload-target')
  @Authorized('schoolConfig.logo.upload')
  @ApiOperation({ summary: 'Request an upload target for a new school logo.' })
  @ApiOkResponse({ type: RequestMediaUploadResponseDto })
  async requestLogoUpload(
    @Req() req: FastifyRequest,
    @Body() body: RequestLogoUploadDto,
  ): Promise<RequestMediaUploadResponseDto> {
    const user = currentUser(req);
    return this.branding.requestLogoUpload(user.schoolId, user.userId, body);
  }

  @Post('logo/upload-target/:id/complete')
  @Authorized('schoolConfig.logo.upload')
  @ApiOperation({ summary: 'Finalise and validate an uploaded logo by content sniffing.' })
  @ApiOkResponse({ type: MediaAssetSummaryResponseDto })
  async completeLogoUpload(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<MediaAssetSummaryResponseDto> {
    return this.branding.completeLogoUpload(currentUser(req).schoolId, id);
  }

  @Get()
  @Authorized('schoolConfig.branding.view')
  @ApiOperation({ summary: "The caller's own school branding + derived palette." })
  @ApiOkResponse({ type: SchoolBrandingResponseDto })
  async getBranding(@Req() req: FastifyRequest): Promise<SchoolBrandingResponseDto> {
    return this.branding.getBranding(currentUser(req).schoolId);
  }

  @Put()
  @Authorized('schoolConfig.colour.set')
  @ApiOperation({
    summary: 'Update logo and/or primary colour (School Admin only) — freely editable, audited.',
  })
  @ApiOkResponse({ type: SchoolBrandingResponseDto })
  async updateBranding(
    @Req() req: FastifyRequest,
    @Body() body: UpdateSchoolBrandingDto,
  ): Promise<SchoolBrandingResponseDto> {
    const user = currentUser(req);
    return this.branding.updateBranding(user.schoolId, user.userId, body);
  }
}
