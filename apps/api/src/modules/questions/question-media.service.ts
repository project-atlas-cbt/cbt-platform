import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { MediaService } from '../media/media.service.js';
import type {
  MediaAssetSummaryResponseDto,
  RequestMediaUploadResponseDto,
} from '../media/dto/media.dto.js';
import { toMediaResponseDto } from './question-mappers.js';
import { requireTeacherAssignedScope } from './question-scope.util.js';
import type {
  AttachQuestionMediaDto,
  QuestionMediaItemResponseDto,
  RequestQuestionMediaUploadDto,
} from './dto/question.dto.js';

/**
 * Two responsibilities, deliberately kept in one small service:
 *
 * 1. The dedicated upload-target/complete pair (`POST /v1/questions/media/
 *    upload-target(/:id/complete)`) that closes `media.upload`'s TEACHER
 *    ASSIGNED-scope gap — `subjectId`+`level` let this resolve real scope
 *    via the same ADR-0001 join question creation itself uses, before any
 *    `Question`/`QuestionRevision` exists yet (mirrors
 *    `school-branding.controller.ts`'s own logo upload-target precedent:
 *    calls into `MediaService` for the actual upload/validate/sign
 *    mechanics, never duplicating them).
 * 2. Attaching/detaching an already-`READY` asset to a specific `DRAFT`
 *    revision (`QuestionMedia` rows) — DoD item 10.
 */
@Injectable()
export class QuestionMediaService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly media: MediaService,
  ) {}

  async requestUpload(
    schoolId: string,
    actor: AuthorizedActor,
    uploaderUserId: string,
    teacherProfileId: string,
    dto: RequestQuestionMediaUploadDto,
  ): Promise<RequestMediaUploadResponseDto> {
    await requireTeacherAssignedScope(this.authz, actor, 'media.upload', {
      schoolId,
      teacherProfileId,
      subjectId: dto.subjectId,
      level: dto.level,
    });
    return this.media.requestUpload({
      schoolId,
      uploaderUserId,
      type: dto.type,
      filename: dto.filename,
      declaredMimeType: dto.declaredMimeType,
      declaredSizeBytes: dto.declaredSizeBytes,
    });
  }

  async completeUpload(
    schoolId: string,
    mediaAssetId: string,
  ): Promise<MediaAssetSummaryResponseDto> {
    return this.media.completeUpload(schoolId, mediaAssetId);
  }

  /** DoD item 3/10: only while the revision is still `DRAFT` — the
   * question_media immutability trigger is the database-level backstop
   * once `APPROVED`. */
  async attach(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    revisionId: string,
    dto: AttachQuestionMediaDto,
  ): Promise<QuestionMediaItemResponseDto> {
    const revision = await this.requireOwnedDraftRevision(schoolId, actor, questionId, revisionId);
    const asset = await this.media.getReadyQuestionMediaAsset(schoolId, dto.mediaAssetId);
    if (!asset) {
      throw new AppHttpException({
        code: 'MEDIA_NOT_READY',
        message: 'This asset is not a ready question image/diagram belonging to this school.',
      });
    }
    const created = await withTenant(prisma, schoolId, (tx) =>
      tx.questionMedia.create({
        data: {
          schoolId,
          questionRevisionId: revision.id,
          mediaAssetId: asset.id,
          displayOrder: dto.displayOrder,
        },
        include: { mediaAsset: { select: { type: true } } },
      }),
    );
    return toMediaResponseDto(created);
  }

  async detach(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    revisionId: string,
    mediaId: string,
  ): Promise<void> {
    await this.requireOwnedDraftRevision(schoolId, actor, questionId, revisionId);
    const media = await withTenant(prisma, schoolId, (tx) =>
      tx.questionMedia.findUnique({ where: { id: mediaId } }),
    );
    if (!media || media.schoolId !== schoolId || media.questionRevisionId !== revisionId) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question media not found.' });
    }
    await withTenant(prisma, schoolId, (tx) => tx.questionMedia.delete({ where: { id: mediaId } }));
  }

  private async requireOwnedDraftRevision(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    revisionId: string,
  ): Promise<{ id: string; status: string }> {
    const revision = await withTenant(prisma, schoolId, (tx) =>
      tx.questionRevision.findUnique({ where: { id: revisionId } }),
    );
    if (!revision || revision.schoolId !== schoolId || revision.questionId !== questionId) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question revision not found.' });
    }
    const decision = await this.authz.evaluate(actor, 'questionBank.editOwnDraft', {
      schoolId,
      ownerMembershipId: revision.createdByMembershipId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to edit this revision.',
      });
    }
    if (revision.status !== 'DRAFT') {
      throw new AppHttpException({
        code: 'QUESTION_REVISION_NOT_DRAFT',
        message: 'Media may only be attached to or removed from a draft revision.',
      });
    }
    return revision;
  }
}
