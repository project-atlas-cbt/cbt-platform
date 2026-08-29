import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import {
  MediaAssetSummaryResponseDto,
  RequestMediaUploadResponseDto,
} from '../media/dto/media.dto.js';
import { QuestionMediaService } from './question-media.service.js';
import {
  AttachQuestionMediaDto,
  QuestionMediaItemResponseDto,
  RequestQuestionMediaUploadDto,
} from './dto/question.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `questions.v1` — the dedicated upload-target/complete pair
 * (`/questions/media/upload-target`) that closes `media.upload`'s TEACHER
 * ASSIGNED-scope gap (see `QuestionMediaService`'s own doc comment), plus
 * attach/detach onto a specific draft revision (DoD item 10). Declared as
 * its own controller, not folded into `QuestionRevisionController`,
 * mirroring `class-credential-sheet.controller.ts`'s own precedent for
 * splitting out a distinct concern rather than growing one controller
 * indefinitely.
 */
@ApiTags('questions')
@Controller('questions')
export class QuestionMediaController {
  constructor(private readonly media: QuestionMediaService) {}

  @Post('media/upload-target')
  @Authorized('media.upload')
  @ApiOperation({
    summary: 'Request an upload target for a question image/diagram, scope-checked.',
  })
  @ApiOkResponse({ type: RequestMediaUploadResponseDto })
  async requestUpload(
    @Req() req: FastifyRequest,
    @Body() body: RequestQuestionMediaUploadDto,
  ): Promise<RequestMediaUploadResponseDto> {
    const user = currentUser(req);
    const teacherProfile = await withTenant(prisma, user.schoolId, (tx) =>
      tx.teacherProfile.findUnique({
        where: {
          schoolId_membershipId: { schoolId: user.schoolId, membershipId: user.membershipId },
        },
        select: { id: true },
      }),
    );
    if (!teacherProfile) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'Only an actor with an active teacher profile may upload question media.',
      });
    }
    return this.media.requestUpload(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      user.userId,
      teacherProfile.id,
      body,
    );
  }

  @Post('media/upload-target/:id/complete')
  @Authorized('media.upload')
  @ApiOperation({ summary: 'Finalise and validate an uploaded question image/diagram.' })
  @ApiOkResponse({ type: MediaAssetSummaryResponseDto })
  async completeUpload(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<MediaAssetSummaryResponseDto> {
    return this.media.completeUpload(currentUser(req).schoolId, id);
  }

  @Post(':questionId/revisions/:revisionId/media')
  @HttpCode(HttpStatus.CREATED)
  @Authorized('questionBank.editOwnDraft')
  @ApiOperation({ summary: 'Attach an already-uploaded, READY asset to a draft revision.' })
  @ApiOkResponse({ type: QuestionMediaItemResponseDto })
  async attach(
    @Req() req: FastifyRequest,
    @Param('questionId') questionId: string,
    @Param('revisionId') revisionId: string,
    @Body() body: AttachQuestionMediaDto,
  ): Promise<QuestionMediaItemResponseDto> {
    const user = currentUser(req);
    return this.media.attach(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      questionId,
      revisionId,
      body,
    );
  }

  @Delete(':questionId/revisions/:revisionId/media/:mediaId')
  @Authorized('questionBank.editOwnDraft')
  @ApiOperation({ summary: 'Remove media from a draft revision.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async detach(
    @Req() req: FastifyRequest,
    @Param('questionId') questionId: string,
    @Param('revisionId') revisionId: string,
    @Param('mediaId') mediaId: string,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.media.detach(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      questionId,
      revisionId,
      mediaId,
    );
    return { status: 'ok' };
  }
}
