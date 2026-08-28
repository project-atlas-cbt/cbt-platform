import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';
import { TEACHER_ASSIGNMENT_STATUSES, type TeacherAssignmentStatus } from '@atlas/domain';

/** `PUT /v1/teachers/:id/assignments` — full-replace semantics (05 §12.1's
 * checkbox editor submits the teacher's whole subject×class set as one
 * list). `:id` (teacherProfileId) comes from the route param. */
export class ReplaceTeacherAssignmentsDto {
  @ApiProperty({ type: String })
  @IsUUID()
  academicSessionId!: string;

  // No version arg — this codebase uses UUIDv7 primary keys throughout
  // (matches CreateHodAssignmentDto's own plain @IsUUID() precedent);
  // `IsUUID('4', ...)` would reject every real id here.
  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @IsUUID(undefined, { each: true })
  classSubjectIds!: string[];
}

export class TeacherAssignmentResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  teacherProfileId!: string;

  @ApiProperty({ type: String })
  classSubjectId!: string;

  @ApiProperty({ type: String })
  academicSessionId!: string;

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  endDate!: string | null;

  @ApiProperty({ type: String, enum: TEACHER_ASSIGNMENT_STATUSES })
  status!: TeacherAssignmentStatus;
}

export class TeacherAssignmentListResponseDto {
  @ApiProperty({ type: TeacherAssignmentResponseDto, isArray: true })
  assignments!: TeacherAssignmentResponseDto[];
}
