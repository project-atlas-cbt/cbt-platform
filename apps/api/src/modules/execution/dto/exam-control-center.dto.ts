import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EXAM_STATUSES, type AttemptSignalCounts, type ExamStatus } from '@atlas/domain';
import { ExamSessionResponseDto } from './exam-session.dto.js';

/**
 * `POST /v1/exams/:id/complete` — End Examination (A-14). The submitted
 * list must exactly match the server's own current pending-absentee set
 * (every `AUTHORIZED` participant across this exam's sessions with no
 * `ExamParticipation` row yet) — forces the client to have called
 * `GET .../control` first rather than confirming a list computed from
 * stale data. An empty array is valid when nobody was ever authorized.
 */
export class CompleteExamDto {
  @ApiProperty({ type: String, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  confirmedAbsentStudentProfileIds?: string[];

  /** B16's session-scoped replacement. The legacy student-only list remains
   * accepted by `/complete` while F16 migrates to this precise shape. */
  @ApiProperty({ type: () => ConfirmAbsentParticipationDto, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmAbsentParticipationDto)
  confirmedAbsentParticipations?: ConfirmAbsentParticipationDto[];
}

export class ConfirmAbsentParticipationDto {
  @ApiProperty() @IsUUID() examSessionId!: string;
  @ApiProperty() @IsUUID() studentProfileId!: string;
}

export class ExamControlCenterAggregateDto {
  @ApiProperty({ type: Number, description: 'AUTHORIZED ExamSessionParticipant count — real.' })
  authorizedCount!: number;

  @ApiProperty({
    type: Number,
    description:
      'Registration roll-ups for the same authorized cohort — real since B13 ' +
      '(independent ExamAttempt counts; a submitted student is never also counted not-started).',
  })
  notStartedCount!: number;

  @ApiProperty({
    type: Number,
    description:
      'Real since B13 ships ExamAttempt — students with a currently-IN_PROGRESS attempt.',
  })
  inProgressCount!: number;

  @ApiProperty({
    type: Number,
    description:
      'Real since B13 ships ExamAttempt — students whose attempt reached ' +
      'SUBMITTED/AUTO_SUBMITTED.',
  })
  submittedCount!: number;

  @ApiProperty({
    type: Number,
    description: 'Real, but only ever non-zero after End Examination (ExamParticipation).',
  })
  absentCount!: number;

  @ApiProperty({
    type: Boolean,
    description:
      'Always true since B13 ships ExamAttempt — retained on the contract only so no ' +
      'future client can ever mistake an uncomputed count for a real zero.',
  })
  attemptDataAvailable!: boolean;
}

/** B13 — one row per currently-`IN_PROGRESS` `ExamAttempt` for this exam.
 * `studentName`/`startedAt` were added after B13 shipped (2026-09) so the
 * Control Center's live attempt table can name rows and show a start time. */
export class AttemptSignalCountsDto implements AttemptSignalCounts {
  @ApiProperty({ type: Number })
  WINDOW_BLUR!: number;

  @ApiProperty({ type: Number })
  FULLSCREEN_EXIT!: number;

  @ApiProperty({ type: Number })
  TAB_HIDDEN!: number;

  @ApiProperty({ type: Number })
  RECONNECTED!: number;

  @ApiProperty({ type: Number })
  RESUMED!: number;

  @ApiProperty({ type: Number })
  BINDING_MISMATCH!: number;
}

export class ExamLiveAttemptRowDto {
  @ApiProperty({ type: String })
  studentProfileId!: string;

  @ApiProperty({ type: String })
  studentName!: string;

  @ApiProperty({ type: String })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ type: Number, nullable: true })
  timeRemainingSeconds!: number | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When the server last heard from this attempt (heartbeat or answer save).',
  })
  lastSeenAt!: string;

  @ApiProperty({
    type: Boolean,
    description:
      'B23 (M-09, ADR-0020): nothing heard for longer than DISCONNECTED_AFTER_MS (90 s) when the snapshot was computed. A signal for the invigilator, not an attempt state.',
  })
  disconnected!: boolean;

  @ApiProperty({
    type: AttemptSignalCountsDto,
    description: 'B23 (M-08, ADR-0020): integrity-signal counts by type — counts, not judgements.',
  })
  signals!: AttemptSignalCountsDto;
}

export class ExamControlCenterStalenessDto {
  @ApiProperty({ type: Boolean })
  isStale!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: "The earliest openedAt/reopenedAt across this exam's currently-OPEN sessions.",
  })
  openSince!: string | null;

  @ApiProperty({ type: Number })
  thresholdMs!: number;
}

/** `GET /v1/exams/:id/control` and the SSE stream's own snapshot payload
 * share this exact shape. Post-B13 all counts in `aggregate` and every
 * `liveAttempts` row are computed from real `ExamAttempt` data. */
export class ExamControlCenterResponseDto {
  @ApiProperty({ type: String })
  examId!: string;

  @ApiProperty({ type: String, enum: EXAM_STATUSES })
  examStatus!: ExamStatus;

  @ApiProperty({ type: ExamSessionResponseDto, isArray: true })
  sessions!: ExamSessionResponseDto[];

  @ApiProperty({ type: ExamControlCenterAggregateDto })
  aggregate!: ExamControlCenterAggregateDto;

  @ApiProperty({ type: ExamLiveAttemptRowDto, isArray: true })
  liveAttempts!: ExamLiveAttemptRowDto[];

  @ApiProperty({ type: ExamControlCenterStalenessDto })
  staleness!: ExamControlCenterStalenessDto;

  @ApiProperty({ type: String, format: 'date-time' })
  computedAt!: string;
}
