import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';

export const EXPORT_TYPES = [
  'EXAM_RESULTS',
  'STUDENTS',
  'TEACHERS',
  'CLASSES',
  'QUESTION_BANK',
  'PARTICIPATION',
] as const;

export class CreateExportDto {
  @ApiProperty({ enum: EXPORT_TYPES })
  @IsIn(EXPORT_TYPES)
  type!: (typeof EXPORT_TYPES)[number];

  @ApiPropertyOptional({
    description: 'Validated export scope; identifiers are checked server-side.',
  })
  @IsOptional()
  @IsObject()
  scope?: Record<string, unknown>;
}

/** Canonicalized server-side scope persisted in ExportJob.scope. */
export interface ExportScope {
  examId?: string;
  classId?: string;
  subjectId?: string;
  departmentId?: string;
  level?: string;
}

export class ExportJobResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'] })
  status!: string;
  @ApiProperty({ enum: EXPORT_TYPES }) type!: string;
  @ApiProperty() expiresAt!: string;
  @ApiPropertyOptional() downloadUrl?: string;
  @ApiPropertyOptional() failureReason?: string;
  @ApiProperty() rowCount!: number;
}

export class ExportIdParamDto {
  @IsUUID()
  id!: string;
}
