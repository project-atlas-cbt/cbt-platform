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

/** `GET /v1/classes/:id/teachers` — F6 gap-closure (no class-centric teacher
 * lookup existed before this; only the per-teacher `GET /teachers/:id/
 * assignments` did). Enriched the same way `ClassRosterEntryDto` (B6)
 * already is, so Class Detail's Teachers tab is directly displayable
 * without a second lookup per row. */
export class ClassTeacherEntryDto {
  @ApiProperty({ type: String })
  assignmentId!: string;

  @ApiProperty({ type: String })
  teacherProfileId!: string;

  @ApiProperty({ type: String })
  staffId!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String })
  subjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: String })
  subjectCode!: string;

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;
}

export class ClassTeachersResponseDto {
  @ApiProperty({ type: ClassTeacherEntryDto, isArray: true })
  teachers!: ClassTeacherEntryDto[];
}

/** `GET /v1/teachers/me/assignments` — F11 gap-closure (2026-09-03): the
 * caller's own active class×subject assignments, self-resolved from the
 * session (no `teacherProfileId` needed in the URL, unlike the sibling
 * per-teacher route above) — the data source the exam builder's class/
 * subject pickers need, since `schoolConfig.class.view`/`.subject.view` are
 * both denied to TEACHER (F6 precedent). Deliberately more enriched than
 * `TeacherAssignmentResponseDto` (class/subject names, level, arm) since a
 * picker needs to render these directly, not chase a second lookup per row. */
export class MyTeacherAssignmentEntryDto {
  @ApiProperty({ type: String })
  classSubjectId!: string;

  @ApiProperty({ type: String })
  academicSessionId!: string;

  @ApiProperty({ type: String })
  classId!: string;

  @ApiProperty({ type: String })
  className!: string;

  @ApiProperty({ type: String })
  level!: string;

  @ApiProperty({ type: String })
  arm!: string;

  @ApiProperty({ type: String })
  subjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;
}

export class MyTeacherAssignmentsResponseDto {
  @ApiProperty({ type: MyTeacherAssignmentEntryDto, isArray: true })
  assignments!: MyTeacherAssignmentEntryDto[];
}
