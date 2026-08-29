import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import {
  IMPORT_JOB_STATUSES,
  IMPORT_JOB_TYPES,
  IMPORT_ROW_STATUSES,
  type ImportJobStatus,
  type ImportJobType,
  type ImportRowStatus,
} from '@atlas/domain';

export { IMPORT_JOB_TYPES, type ImportJobType };
export type ImportJobStatusDto = ImportJobStatus;
export type ImportRowStatusDto = ImportRowStatus;

/** `/imports/upload-target` — deliberately doesn't take `type`, unlike the
 * generic MediaController's own `RequestMediaUploadDto`: nothing about
 * getting bytes into storage needs to know STUDENTS vs TEACHERS yet, and
 * both `users.import.*` rows share an identical grant shape (see
 * imports.controller.ts's own inline note at each call site). */
export class RequestImportUploadDto {
  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({
    type: String,
    description:
      'Client-declared MIME type — never trusted alone; complete() re-derives it by content.',
  })
  @IsString()
  declaredMimeType!: string;

  @ApiProperty({ type: Number, description: 'Used to pin Content-Length on the presigned PUT.' })
  @IsInt()
  @Min(1)
  declaredSizeBytes!: number;
}

export class RequestImportUploadResponseDto {
  @ApiProperty({ type: String })
  mediaAssetId!: string;

  @ApiProperty({ type: String })
  uploadUrl!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

export class CreateStudentImportDto {
  @ApiProperty({ type: String, description: 'A completed (READY) IMPORT_SOURCE MediaAsset id.' })
  @IsUUID()
  mediaAssetId!: string;

  @ApiPropertyOptional({
    type: String,
    description:
      "Defaults to the school's current (CURRENT) academic session when omitted — every row's " +
      'Class resolves against this one session.',
  })
  @IsOptional()
  @IsUUID()
  academicSessionId?: string;
}

export class CreateTeacherImportDto {
  @ApiProperty({ type: String, description: 'A completed (READY) IMPORT_SOURCE MediaAsset id.' })
  @IsUUID()
  mediaAssetId!: string;
}

/** B8 — question import never resolves/needs an academic session (a
 * `Question.level` outlives any one session, unlike a `StudentEnrollment`)
 * — mirrors `CreateTeacherImportDto`'s exact shape. */
export class CreateQuestionImportDto {
  @ApiProperty({ type: String, description: 'A completed (READY) IMPORT_SOURCE MediaAsset id.' })
  @IsUUID()
  mediaAssetId!: string;
}

export class ImportJobResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, enum: IMPORT_JOB_TYPES })
  type!: ImportJobType;

  @ApiProperty({ type: String, enum: IMPORT_JOB_STATUSES })
  status!: ImportJobStatusDto;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null for TEACHERS jobs, which have no target session.',
  })
  targetAcademicSessionId!: string | null;

  @ApiProperty({ type: Number })
  templateVersion!: number;

  @ApiProperty({ type: Number })
  totalRows!: number;

  @ApiProperty({ type: Number })
  validRows!: number;

  @ApiProperty({ type: Number })
  invalidRows!: number;

  @ApiProperty({ type: Number })
  committedRows!: number;

  @ApiProperty({ type: Number })
  failedRows!: number;

  @ApiProperty({ type: String, nullable: true })
  failureReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class ImportJobListResponseDto {
  @ApiProperty({ type: ImportJobResponseDto, isArray: true })
  jobs!: ImportJobResponseDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
}

export class ListImportJobsQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ImportRowFieldErrorDto {
  @ApiProperty({ type: String })
  field!: string;

  @ApiProperty({ type: String })
  message!: string;
}

export class ImportRowResponseDto {
  @ApiProperty({ type: Number })
  rowNumber!: number;

  @ApiProperty({ type: String, enum: IMPORT_ROW_STATUSES })
  status!: ImportRowStatusDto;

  @ApiProperty({ type: Object, description: 'The parsed row, keyed by template column name.' })
  rawData!: Record<string, string>;

  @ApiProperty({ type: ImportRowFieldErrorDto, isArray: true, nullable: true })
  errors!: { field: string; message: string }[] | null;
}

export class ListImportRowsQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({ type: String, enum: IMPORT_ROW_STATUSES })
  @IsOptional()
  @IsIn(IMPORT_ROW_STATUSES)
  status?: ImportRowStatusDto;
}

export class ImportJobDetailResponseDto extends ImportJobResponseDto {
  @ApiProperty({ type: ImportRowResponseDto, isArray: true })
  rows!: ImportRowResponseDto[];

  @ApiProperty({ type: Number })
  rowsTotal!: number;

  @ApiProperty({ type: Number })
  rowsPage!: number;

  @ApiProperty({ type: Number })
  rowsPageSize!: number;
}
