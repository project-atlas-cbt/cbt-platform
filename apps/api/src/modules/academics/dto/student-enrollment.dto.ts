import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
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

  /** ADR-0038: omitted, the student takes the class's default stream (or,
   * on a move into a mixed arm, keeps the one they had); null, none. */
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  streamId?: string | null;
}

/** `PUT /v1/students/:id/stream` (ADR-0038). Null takes the student out of
 * any stream. */
export class SetStudentStreamDto {
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  streamId!: string | null;
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

  @ApiProperty({ type: String, nullable: true })
  streamId!: string | null;

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

  @ApiProperty({ type: String, nullable: true })
  streamId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  streamName!: string | null;
}

export class ClassRosterResponseDto {
  @ApiProperty({ type: ClassRosterEntryDto, isArray: true })
  students!: ClassRosterEntryDto[];
}
