import { Injectable } from '@nestjs/common';
import { prisma } from '@atlas/db';
import { derivePalette } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { MediaService } from '../media/media.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import type {
  RequestLogoUploadDto,
  SchoolBrandingResponseDto,
  UpdateSchoolBrandingDto,
} from './dto/school-branding.dto.js';
import type {
  MediaAssetSummaryResponseDto,
  RequestMediaUploadResponseDto,
} from '../media/dto/media.dto.js';

/**
 * `PUT/GET /v1/school/branding` (03 §5, 05 §6.1) — reachable only through
 * a school session (`@Authorized`), so only SCHOOL_ADMIN can ever pass
 * `schoolConfig.colour.set`/`schoolConfig.logo.upload`'s grants (both deny
 * every other school role; Software Admin's own PLATFORM-scoped grant on
 * these same permission ids has no reachable endpoint yet — same
 * currently-unreachable-but-correctly-declared situation as
 * `schoolConfig.profile.edit`, not a gap introduced here). `actorRole` is
 * therefore hardcoded below, mirroring `ActivationService`'s identical
 * precedent for a route only one role can ever reach.
 */
@Injectable()
export class SchoolBrandingService {
  constructor(
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  async requestLogoUpload(
    schoolId: string,
    uploaderUserId: string,
    dto: RequestLogoUploadDto,
  ): Promise<RequestMediaUploadResponseDto> {
    return this.media.requestUpload({
      schoolId,
      uploaderUserId,
      type: 'SCHOOL_LOGO',
      filename: dto.filename,
      declaredMimeType: dto.declaredMimeType,
      declaredSizeBytes: dto.declaredSizeBytes,
    });
  }

  async completeLogoUpload(
    schoolId: string,
    mediaAssetId: string,
  ): Promise<MediaAssetSummaryResponseDto> {
    return this.media.completeUpload(schoolId, mediaAssetId);
  }

  async getBranding(schoolId: string): Promise<SchoolBrandingResponseDto> {
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { logoMediaId: true, primaryColor: true },
    });
    return this.toResponse(schoolId, school.logoMediaId, school.primaryColor);
  }

  async updateBranding(
    schoolId: string,
    actorUserId: string,
    dto: UpdateSchoolBrandingDto,
  ): Promise<SchoolBrandingResponseDto> {
    const before = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { logoMediaId: true, primaryColor: true },
    });

    const data: { logoMediaId?: string | null; primaryColor?: string | null } = {};

    if (dto.logoMediaId !== undefined) {
      if (dto.logoMediaId === null) {
        data.logoMediaId = null;
      } else {
        const asset = await this.media.getReadyLogoAsset(schoolId, dto.logoMediaId);
        if (!asset) {
          throw new AppHttpException({
            code: 'MEDIA_NOT_READY',
            message:
              'logoMediaId must reference a READY, SCHOOL_LOGO-typed asset from this school.',
          });
        }
        data.logoMediaId = asset.id;
      }
    }

    if (dto.primaryColor !== undefined) {
      if (dto.primaryColor !== null) {
        // Throws a clear error for an unparseable colour (derivePalette's
        // own contract) — surfaced as a 400, never silently defaulted.
        try {
          derivePalette(dto.primaryColor);
        } catch (error) {
          throw new AppHttpException({
            code: 'VALIDATION_ERROR',
            message: error instanceof Error ? error.message : 'Invalid primaryColor.',
          });
        }
      }
      data.primaryColor = dto.primaryColor;
    }

    if (Object.keys(data).length > 0) {
      await prisma.school.update({ where: { id: schoolId }, data });
      // Freely editable at any time (audit finding A-18's resolution) —
      // every change is audited, not just the first one.
      await this.audit.record({
        schoolId,
        actorUserId,
        actorRole: 'SCHOOL_ADMIN',
        action: 'SCHOOL_BRANDING_CHANGED',
        entityType: 'School',
        entityId: schoolId,
        metadata: {
          before: { logoMediaId: before.logoMediaId, primaryColor: before.primaryColor },
          after: {
            logoMediaId: data.logoMediaId !== undefined ? data.logoMediaId : before.logoMediaId,
            primaryColor: data.primaryColor !== undefined ? data.primaryColor : before.primaryColor,
          },
        },
      });
    }

    const after = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { logoMediaId: true, primaryColor: true },
    });
    return this.toResponse(schoolId, after.logoMediaId, after.primaryColor);
  }

  private async toResponse(
    schoolId: string,
    logoMediaId: string | null,
    primaryColor: string | null,
  ): Promise<SchoolBrandingResponseDto> {
    const logoUrl = logoMediaId ? await this.media.getLogoSignedUrl(schoolId, logoMediaId) : null;
    const palette = primaryColor ? derivePalette(primaryColor) : null;
    return { logoUrl, primaryColor, palette };
  }
}
