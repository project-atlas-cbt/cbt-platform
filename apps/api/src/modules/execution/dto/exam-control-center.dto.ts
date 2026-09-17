import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EXAM_STATUSES, type ExamStatus } from '@atlas/domain';
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
    description: 'Real in B12, but degenerate: always equals authorizedCount (no attempts exist).',
  })
  notStartedCount!: number;

  @ApiProperty({ type: Number, description: 'PLACEHOLDER — always 0 until B13 ships ExamAttempt.' })
  inProgressCount!: number;

  @ApiProperty({ type: Number, description: 'PLACEHOLDER — always 0 until B13 ships ExamAttempt.' })
  submittedCount!: number;

  @ApiProperty({
    type: Number,
    description: 'Real, but only ever non-zero after End Examination (ExamParticipation).',
  })
  absentCount!: number;

  @ApiProperty({
    type: Boolean,
    description:
      'False in B12 — lets the frontend distinguish a real "0" from "not yet real" for ' +
      'inProgressCount/submittedCount/liveAttempts.',
  })
  attemptDataAvailable!: boolean;
}

/** Reserved shape for B13 — no field is ever populated in B12; `liveAttempts`
 * is always `[]`. */
export class ExamLiveAttemptRowDto {
  @ApiProperty({ type: String })
  studentProfileId!: string;

  @ApiProperty({ type: String })
  status!: string;

  @ApiProperty({ type: Number, nullable: true })
  timeRemainingSeconds!: number | null;
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
 * share this exact shape — additive-only for B13 (fills `inProgressCount`/
 * `submittedCount`/`liveAttempts`, flips `attemptDataAvailable`; adds no new
 * top-level keys). */
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
