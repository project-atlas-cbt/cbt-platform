import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { STUDENT_ENROLLMENT_STATUSES, type StudentEnrollmentStatus } from '@atlas/domain';

/** `POST /v1/students/:id/enrollments` — serves both "enroll" (no active
 * enrollment yet in this session) and "move" (already enrolled, different
 * class) per the roadmap's own wording; see StudentEnrollmentService.enroll
 * for the full logic. `:id` (studentProfileId) comes from the route param. */
export class EnrollStudentDto {
  @ApiProperty({ type: String })
  @IsUUID()
  academicSessionId!: string;

  @ApiProperty({ type: String })
  @IsUUID()
  classId!: string;
}

export class StudentEnrollmentResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  studentProfileId!: string;

  @ApiProperty({ type: String })
  academicSessionId!: string;

  @ApiProperty({ type: String })
  classId!: string;

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  endDate!: string | null;

  @ApiProperty({ type: String, enum: STUDENT_ENROLLMENT_STATUSES })
  status!: StudentEnrollmentStatus;
}

export class StudentEnrollmentListResponseDto {
  @ApiProperty({ type: StudentEnrollmentResponseDto, isArray: true })
  enrollments!: StudentEnrollmentResponseDto[];
}

/** `GET /v1/classes/:id/students` — roster entry, enriched with display
 * fields so the roster is directly displayable without a second call per
 * row, matching ClassSubjectResponseDto's own enrichment precedent. */
export class ClassRosterEntryDto {
  @ApiProperty({ type: String })
  enrollmentId!: string;

  @ApiProperty({ type: String })
  studentProfileId!: string;

  @ApiProperty({ type: String })
  studentId!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;
}

export class ClassRosterResponseDto {
  @ApiProperty({ type: ClassRosterEntryDto, isArray: true })
  students!: ClassRosterEntryDto[];
}
