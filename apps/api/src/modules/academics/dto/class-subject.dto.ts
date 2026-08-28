import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { CLASS_SUBJECT_STATUSES, type ClassSubjectStatus } from '@atlas/domain';

/** `classId` comes from the route param (`POST /v1/academics/classes/:id/subjects`). */
export class CreateClassSubjectDto {
  @ApiProperty({ type: String })
  @IsUUID()
  subjectId!: string;
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
}

export class ClassSubjectListResponseDto {
  @ApiProperty({ type: ClassSubjectResponseDto, isArray: true })
  offerings!: ClassSubjectResponseDto[];
}
