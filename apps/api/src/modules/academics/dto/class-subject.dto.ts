import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
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

  /** ADR-0038: on an ELECTIVE offering, the streams whose students are
   * registered automatically ("Physics for Science"). */
  @ApiPropertyOptional({ type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  streamIds?: string[];
}

/** ADR-0038: who takes an offering. COMPULSORY clears any streams. */
export class UpdateClassSubjectDto {
  @ApiPropertyOptional({ type: String, enum: CLASS_SUBJECT_KINDS })
  @IsOptional()
  @IsIn(CLASS_SUBJECT_KINDS)
  kind?: ClassSubjectKind;

  @ApiPropertyOptional({ type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  streamIds?: string[];
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

  /** ADR-0038: streams registered automatically (ELECTIVE only). */
  @ApiProperty({ type: String, isArray: true })
  streamIds!: string[];

  @ApiProperty({ type: String, isArray: true })
  streamNames!: string[];
}

export class ClassSubjectListResponseDto {
  @ApiProperty({ type: ClassSubjectResponseDto, isArray: true })
  offerings!: ClassSubjectResponseDto[];
}
