import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  CLASS_SUBJECT_KINDS,
  CLASS_SUBJECT_STATUSES,
  type ClassSubjectKind,
  type ClassSubjectStatus,
} from '@atlas/domain';

/** `classId` comes from the route param (`POST /v1/academics/classes/:id/subjects`). */
export class CreateClassSubjectDto {
  @ApiProperty({ type: String })
  @IsUUID()
  subjectId!: string;

  @ApiPropertyOptional({
    type: String,
    enum: CLASS_SUBJECT_KINDS,
    description:
      'ADR-0038: COMPULSORY (default) registers every student in the class; ELECTIVE registers nobody.',
  })
  @IsOptional()
  @IsIn(CLASS_SUBJECT_KINDS)
  kind?: ClassSubjectKind;
}

export class UpdateClassSubjectDto {
  @ApiProperty({ type: String, enum: CLASS_SUBJECT_KINDS })
  @IsIn(CLASS_SUBJECT_KINDS)
  kind!: ClassSubjectKind;
}

/** `07 §6.6`'s offering shape, enriched with the subject's own name/code so
 * the class-subjects list is directly displayable without a second call. */
export class ClassSubjectResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  classId!: string;

  @ApiProperty({ type: String })
  subjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: String })
  subjectCode!: string;

  @ApiProperty({ type: String })
  academicSessionId!: string;

  @ApiProperty({ type: String, enum: CLASS_SUBJECT_STATUSES })
  status!: ClassSubjectStatus;

  @ApiProperty({ type: String, enum: CLASS_SUBJECT_KINDS })
  kind!: ClassSubjectKind;
}

export class ClassSubjectListResponseDto {
  @ApiProperty({ type: ClassSubjectResponseDto, isArray: true })
  offerings!: ClassSubjectResponseDto[];
}
