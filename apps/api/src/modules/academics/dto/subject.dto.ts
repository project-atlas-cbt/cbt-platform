import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SUBJECT_STATUSES, type SubjectStatus } from '@atlas/domain';

export class CreateSubjectDto {
  @ApiProperty({ type: String, maxLength: 128, example: 'Mathematics' })
  @IsString()
  @MaxLength(128)
  name!: string;

  @ApiProperty({ type: String, maxLength: 16, example: 'MTH' })
  @IsString()
  @MaxLength(16)
  code!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "ADR-0001: a subject with no department falls outside every HOD's automatic review scope.",
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ADR-0038: the "pick N of these" choice group this subject belongs to.',
  })
  @IsOptional()
  @IsUUID()
  choiceGroupId?: string | null;
}

export class UpdateSubjectDto {
  @ApiPropertyOptional({ type: String, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ type: String, maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'ADR-0038: the "pick N of these" choice group this subject belongs to.',
  })
  @IsOptional()
  @IsUUID()
  choiceGroupId?: string | null;
}

export class SubjectResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String, nullable: true })
  departmentId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  choiceGroupId!: string | null;

  @ApiProperty({ type: String, enum: SUBJECT_STATUSES })
  status!: SubjectStatus;
}

export class SubjectListResponseDto {
  @ApiProperty({ type: SubjectResponseDto, isArray: true })
  subjects!: SubjectResponseDto[];
}
