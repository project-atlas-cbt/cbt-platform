import { ApiProperty } from '@nestjs/swagger';
import {
  STUDENT_SUBJECT_REGISTRATION_STATUSES,
  type StudentSubjectRegistrationStatus,
} from '@atlas/domain';

/** ADR-0011 — a student's registration for one of their current
 * enrollment's ClassSubjects, enriched with the subject's own name/code so
 * the list is directly displayable, matching ClassSubjectResponseDto's own
 * enrichment precedent. */
export class StudentSubjectRegistrationResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  studentEnrollmentId!: string;

  @ApiProperty({ type: String })
  classSubjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: String })
  subjectCode!: string;

  @ApiProperty({ type: String, enum: STUDENT_SUBJECT_REGISTRATION_STATUSES })
  status!: StudentSubjectRegistrationStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  registeredAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deregisteredAt!: string | null;
}

export class StudentSubjectRegistrationListResponseDto {
  @ApiProperty({ type: StudentSubjectRegistrationResponseDto, isArray: true })
  registrations!: StudentSubjectRegistrationResponseDto[];
}
