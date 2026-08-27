import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { MediaService } from './media.service.js';
import {
  MediaAssetSummaryResponseDto,
  RequestMediaUploadDto,
  RequestMediaUploadResponseDto,
  SignedMediaUrlResponseDto,
} from './dto/media.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `media.v1` (B4): the generic, type-polymorphic upload/validate/sign
 * pipeline — infrastructure Branding (this phase) and, later, Questions
 * (B8) both consume. Logo upload/attach lives in
 * school-branding.controller.ts instead, gated by the distinct
 * `schoolConfig.logo.upload` permission — see this module's own doc
 * comment (media.module.ts) for why one route can't cleanly serve both.
 */
@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('uploads')
  @Authorized('media.upload')
  @ApiOperation({
    summary: 'Request an upload target for a question image/diagram/other asset (07 §11.3).',
  })
  @ApiOkResponse({ type: RequestMediaUploadResponseDto })
  async requestUpload(
    @Req() req: FastifyRequest,
    @Body() body: RequestMediaUploadDto,
  ): Promise<RequestMediaUploadResponseDto> {
    const user = currentUser(req);
    return this.media.requestUpload({
      schoolId: user.schoolId,
      uploaderUserId: user.userId,
      type: body.type,
      filename: body.filename,
      declaredMimeType: body.declaredMimeType,
      declaredSizeBytes: body.declaredSizeBytes,
    });
  }

  @Post('uploads/:id/complete')
  @Authorized('media.upload')
  @ApiOperation({ summary: 'Finalise and validate an uploaded asset by content sniffing.' })
  @ApiOkResponse({ type: MediaAssetSummaryResponseDto })
  async completeUpload(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<MediaAssetSummaryResponseDto> {
    return this.media.completeUpload(currentUser(req).schoolId, id);
  }

  @Get(':id/url')
  @Authorized('media.view')
  @ApiOperation({ summary: 'Short-lived signed access URL for a non-logo media asset.' })
  @ApiOkResponse({ type: SignedMediaUrlResponseDto })
  async getUrl(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<SignedMediaUrlResponseDto> {
    return this.media.getSignedUrl(currentUser(req).schoolId, id);
  }
}
