import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, MaxLength, Min } from 'class-validator';

/**
 * `POST /v1/media/uploads`'s own `type` never accepts SCHOOL_LOGO (that
 * goes through the branding controller's dedicated logo upload-target
 * pair, gated by schoolConfig.logo.upload rather than media.upload — see
 * school-branding.controller.ts) or REPORT (system-generated only, B18/
 * ADR-0030 — never client-uploadable, rejected before any permission
 * check runs). Keeping the DTO's own enum this narrow, rather than
 * accepting the full MediaAssetType and rejecting two of its five values
 * at runtime, means a client can never even construct an invalid request
 * for those two.
 */
export const MEDIA_UPLOADABLE_TYPES = ['QUESTION_IMAGE', 'QUESTION_DIAGRAM', 'OTHER'] as const;
export type MediaAssetUploadableType = (typeof MEDIA_UPLOADABLE_TYPES)[number];

export class RequestMediaUploadDto {
  @ApiProperty({ type: String, enum: MEDIA_UPLOADABLE_TYPES })
  @IsIn(MEDIA_UPLOADABLE_TYPES)
  type!: MediaAssetUploadableType;

  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({
    type: String,
    description:
      'Client-declared MIME type — never trusted alone; complete() re-derives it by sniffing.',
  })
  @IsString()
  declaredMimeType!: string;

  @ApiProperty({ type: Number, description: 'Used to pin Content-Length on the presigned PUT.' })
  @IsInt()
  @Min(1)
  declaredSizeBytes!: number;
}

export class RequestMediaUploadResponseDto {
  @ApiProperty({ type: String })
  mediaAssetId!: string;

  @ApiProperty({ type: String })
  uploadUrl!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

const MEDIA_ASSET_STATUSES = ['PENDING', 'READY', 'REJECTED'] as const;

export class MediaAssetSummaryResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, enum: MEDIA_ASSET_STATUSES })
  status!: (typeof MEDIA_ASSET_STATUSES)[number];

  @ApiProperty({ type: String, nullable: true })
  sniffedMimeType!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  width!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  height!: number | null;

  @ApiProperty({ type: String, nullable: true })
  rejectionReason!: string | null;
}

export class SignedMediaUrlResponseDto {
  @ApiProperty({ type: String })
  url!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}
