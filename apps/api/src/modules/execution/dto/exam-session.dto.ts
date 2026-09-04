import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  EXAM_ADMINISTRATOR_STATUSES,
  EXAM_SESSION_PARTICIPANT_STATUSES,
  EXAM_SESSION_STATUSES,
  EXAM_SESSION_TYPES,
  type ExamAdministratorStatus,
  type ExamSessionParticipantStatus,
  type ExamSessionStatus,
  type ExamSessionType,
} from '@atlas/domain';

/** `POST /v1/exams/:id/sessions` — `sessionType` is purely descriptive
 * (confirmed product decision, 2026-09-04); omit to default `STANDARD`. */
export class OpenExamSessionDto {
  @ApiPropertyOptional({ type: String, enum: EXAM_SESSION_TYPES })
  @IsOptional()
  @IsIn(EXAM_SESSION_TYPES)
  sessionType?: ExamSessionType;
}

/** `POST /v1/exam-sessions/:id/participants` — batch authorize. Every id is
 * independently eligibility-checked and reported (never silently dropped)
 * in the response's `results` array. */
export class AuthorizeParticipantsDto {
  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  studentProfileIds!: string[];
}

/** `DELETE /v1/exam-sessions/:id/participants/:studentId` — mandatory
 * reason, matching `CancelExamDto`'s own established precedent. */
export class RevokeParticipantDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** `POST /v1/exams/:id/administrators` — ADR-0012/M-15. */
export class AssignExamAdministratorDto {
  @ApiProperty({ type: String, description: "The delegate's SchoolMembership id." })
  @IsUUID()
  membershipId!: string;
}

export class ExamSessionResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  examId!: string;

  @ApiProperty({ type: String, enum: EXAM_SESSION_TYPES })
  sessionType!: ExamSessionType;

  @ApiProperty({ type: String, enum: EXAM_SESSION_STATUSES })
  status!: ExamSessionStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  openedAt!: string;

  @ApiProperty({ type: String })
  openedByMembershipId!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  closedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  closedByMembershipId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  reopenedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  completedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class ExamSessionParticipantResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  examSessionId!: string;

  @ApiProperty({ type: String })
  studentProfileId!: string;

  @ApiProperty({ type: String })
  studentIdNumber!: string;

  @ApiProperty({ type: String })
  studentName!: string;

  @ApiProperty({ type: String, enum: EXAM_SESSION_PARTICIPANT_STATUSES })
  status!: ExamSessionParticipantStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  authorizedAt!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Null when the OPEN_TO_ELIGIBLE bulk sweep created this row — no human authorizer.',
  })
  authorizedByMembershipId!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  revokedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  revokedByMembershipId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  revokedReason!: string | null;
}

/** One outcome row per submitted id — `POST .../participants`'s response
 * shape (never a bare success/failure for the whole batch; an ineligible
 * nominee is reported, not silently dropped). */
export class AuthorizeParticipantResultDto {
  @ApiProperty({ type: String })
  studentProfileId!: string;

  @ApiProperty({ type: Boolean })
  authorized!: boolean;

  @ApiProperty({ type: String, isArray: true, description: 'Empty when authorized === true.' })
  failedChecks!: string[];
}

export class AuthorizeParticipantsResponseDto {
  @ApiProperty({ type: AuthorizeParticipantResultDto, isArray: true })
  results!: AuthorizeParticipantResultDto[];
}

export class ExamAdministratorResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  examId!: string;

  @ApiProperty({ type: String })
  membershipId!: string;

  @ApiProperty({ type: String })
  memberName!: string;

  @ApiProperty({ type: String, enum: EXAM_ADMINISTRATOR_STATUSES })
  status!: ExamAdministratorStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  assignedAt!: string;

  @ApiProperty({ type: String })
  assignedByMembershipId!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  revokedAt!: string | null;
}

/** `GET /v1/exams/:id/eligible-students` — the exam's full targeted-class
 * roster, joined against current participant status where one exists. */
export class EligibleStudentResponseDto {
  @ApiProperty({ type: String })
  studentProfileId!: string;

  @ApiProperty({ type: String })
  studentIdNumber!: string;

  @ApiProperty({ type: String })
  studentName!: string;

  @ApiProperty({ type: Boolean })
  eligible!: boolean;

  @ApiProperty({ type: String, isArray: true })
  failedChecks!: string[];

  @ApiProperty({ type: String, enum: EXAM_SESSION_PARTICIPANT_STATUSES, nullable: true })
  participantStatus!: ExamSessionParticipantStatus | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  examSessionId?: string | null;
}

export class EligibleStudentsResponseDto {
  @ApiProperty({ type: EligibleStudentResponseDto, isArray: true })
  students!: EligibleStudentResponseDto[];
}
