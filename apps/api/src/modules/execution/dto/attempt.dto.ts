import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ATTEMPT_EVENT_TYPES,
  ATTEMPT_STATES,
  type AttemptEventType,
  type AttemptState,
} from '@atlas/domain';

/**
 * `X-05` (BLOCKER, resolved by ADR-0008): the projection this file exposes
 * to a student — `StudentAttemptOptionDto` — has NO `correctFlag` field
 * declared anywhere in its type, ever. This is the type-level half of the
 * mechanism `attempt-snapshot-projection.mapper.ts` implements at runtime
 * (an explicit allow-list object literal, never a spread of the internal
 * snapshot-document option shape, which DOES carry `correctFlag`). A
 * release-blocking contract test (`attempt.integration.test.ts`) asserts
 * the raw JSON response never contains the substring `correctFlag`.
 */
export class StudentAttemptOptionDto {
  @ApiProperty({ type: String })
  optionId!: string;

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: Number, description: 'Materialised display position, 1-indexed.' })
  displayPosition!: number;
}

export class StudentAttemptMediaDto {
  @ApiProperty({ type: String })
  mediaAssetId!: string;

  @ApiProperty({ type: Number })
  displayOrder!: number;

  @ApiProperty({ type: String })
  mediaType!: string;

  @ApiProperty({
    type: String,
    description:
      'A freshly-signed download URL, generated at read time (never stored — ADR-0021 only requires it to outlive the initial download window).',
  })
  url!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  urlExpiresAt!: string;
}

export class StudentAttemptQuestionDto {
  @ApiProperty({ type: String })
  examQuestionId!: string;

  @ApiProperty({ type: Number, description: 'Materialised display order, 1-indexed.' })
  displaySequence!: number;

  @ApiProperty({ type: Number })
  marks!: number;

  @ApiProperty({ type: String })
  questionType!: string;

  @ApiProperty({ type: String, description: 'Sanitized rich-text HTML.' })
  content!: string;

  @ApiProperty({ type: StudentAttemptOptionDto, isArray: true })
  options!: StudentAttemptOptionDto[];

  @ApiProperty({ type: StudentAttemptMediaDto, isArray: true })
  media!: StudentAttemptMediaDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: "This attempt's currently-saved selection for this question, if any.",
  })
  selectedOptionId?: string | null;

  @ApiPropertyOptional({
    type: Number,
    description:
      "This question's own current answer sequence number, for the client's offline queue to continue from.",
  })
  answerSequenceNumber?: number;
}

/** `GET /v1/student/assessment` — "the single available assessment, or
 * none." Every field is nullable together: either every field describes
 * the one relevant exam, or every field is null. */
export class ActiveAssessmentResponseDto {
  @ApiProperty({ type: String, nullable: true })
  examId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  examTitle!: string | null;

  @ApiProperty({ type: String, nullable: true })
  examSessionId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Set only when an attempt is already IN_PROGRESS — the client should resume, not start.',
  })
  attemptId!: string | null;

  @ApiProperty({ type: String, enum: ['NOT_STARTED', 'IN_PROGRESS'], nullable: true })
  state!: 'NOT_STARTED' | 'IN_PROGRESS' | null;
}

/** `GET /v1/student/assessment/:examId/preview` — instructions/rules before
 * starting (`03 §32`–`§36`), no question content. */
export class AttemptPreviewResponseDto {
  @ApiProperty({ type: String })
  examId!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  examType!: string;

  @ApiProperty({ type: Number })
  durationSeconds!: number;

  @ApiProperty({ type: Number })
  attemptLimit!: number;

  @ApiProperty({ type: String, enum: ['FREE', 'SEQUENTIAL_NO_REVISIT', 'SEQUENTIAL_WITH_REVISIT'] })
  navigationPolicy!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  generalInstructions?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  navigationInstructions?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  submissionInstructions?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  accommodations?: string | null;

  @ApiProperty({ type: Number })
  questionCount!: number;

  @ApiProperty({ type: Number })
  totalMarks!: number;
}

/** State/timing only — `POST .../submit` and `POST .../end`'s own response
 * shape, since the caller already holds the full question package from an
 * earlier `start`/resume call. */
export class AttemptStateResponseDto {
  @ApiProperty({ type: String })
  attemptId!: string;

  @ApiProperty({ type: String })
  examId!: string;

  @ApiProperty({ type: String })
  examSessionId!: string;

  @ApiProperty({ type: String, enum: ATTEMPT_STATES })
  state!: AttemptState;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  submittedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  invalidationReason!: string | null;
}

/** `GET /v1/attempts/:id` and the `POST /v1/exams/:id/attempts` response —
 * the full student-facing attempt package (`08 §11.1` step 7). */
export class AttemptPackageResponseDto {
  @ApiProperty({ type: String })
  attemptId!: string;

  @ApiProperty({ type: String })
  examId!: string;

  @ApiProperty({ type: String })
  examSessionId!: string;

  @ApiProperty({ type: String, enum: ATTEMPT_STATES })
  state!: AttemptState;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      "The server's own current clock, alongside `expiresAt` — the client derives remaining time from the DIFFERENCE between the two, never from its own local clock alone (08 §11.4: the client displays the timer but never defines the authoritative deadline).",
  })
  serverTime!: string;

  @ApiProperty({ type: String, enum: ['FREE', 'SEQUENTIAL_NO_REVISIT', 'SEQUENTIAL_WITH_REVISIT'] })
  navigationPolicy!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  generalInstructions?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  navigationInstructions?: string | null;

  @ApiProperty({ type: StudentAttemptQuestionDto, isArray: true })
  questions!: StudentAttemptQuestionDto[];
}

/** `PUT /v1/attempts/:id/answers/:questionId` — one answer save. */
export class SaveAnswerDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  selectedOptionId?: string | null;

  @ApiProperty({
    type: Number,
    description:
      'Client-assigned, monotonic per (attempt, question) — ADR-0007. A write whose sequence is <= the currently stored value is rejected.',
  })
  @IsInt()
  @Min(1)
  sequenceNumber!: number;

  @ApiPropertyOptional({
    type: String,
    enum: ['online', 'offline-replay'],
    description: 'Client-reported, informational only — never used for admissibility.',
  })
  @IsOptional()
  @IsIn(['online', 'offline-replay'])
  source?: 'online' | 'offline-replay';
}

export class SaveAnswerResponseDto {
  @ApiProperty({ type: String })
  examQuestionId!: string;

  @ApiProperty({ type: Boolean })
  accepted!: boolean;

  @ApiProperty({ type: Number })
  sequenceNumber!: number;

  @ApiProperty({
    type: Boolean,
    description: 'True when this write landed inside the ADR-0003 post-expiry grace window.',
  })
  gradeWindowFlag!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  answeredAt!: string;
}

/** `POST /v1/attempts/:id/answers/batch` — one array entry per queued
 * offline answer; each item keyed the same as `SaveAnswerDto` plus its own
 * `examQuestionId` (a single answer save has it in the URL instead). */
export class BatchAnswerItemDto {
  @ApiProperty({ type: String })
  @IsUUID()
  examQuestionId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  selectedOptionId?: string | null;

  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  sequenceNumber!: number;

  @ApiPropertyOptional({ type: String, enum: ['online', 'offline-replay'] })
  @IsOptional()
  @IsIn(['online', 'offline-replay'])
  source?: 'online' | 'offline-replay';
}

export class SaveAnswerBatchDto {
  @ApiProperty({ type: BatchAnswerItemDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchAnswerItemDto)
  answers!: BatchAnswerItemDto[];
}

/** One outcome row per submitted item — never all-or-nothing (a stale
 * item in a batch must not drop the other valid answers in the same
 * flush). */
export class BatchAnswerResultDto {
  @ApiProperty({ type: String })
  examQuestionId!: string;

  @ApiProperty({ type: Boolean })
  accepted!: boolean;

  @ApiPropertyOptional({ type: String, description: 'The rejection error code, if not accepted.' })
  rejectionCode?: string;

  @ApiProperty({ type: Boolean })
  gradeWindowFlag!: boolean;
}

export class SaveAnswerBatchResponseDto {
  @ApiProperty({ type: BatchAnswerResultDto, isArray: true })
  results!: BatchAnswerResultDto[];
}

/** `POST /v1/attempts/:id/events` — ADR-0020 integrity signals, extended
 * with `BINDING_MISMATCH` (this planning session's confirmed decision 1). */
export class RecordAttemptEventDto {
  @ApiProperty({ type: String, enum: ATTEMPT_EVENT_TYPES })
  @IsIn(ATTEMPT_EVENT_TYPES)
  type!: AttemptEventType;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsString()
  occurredAt!: string;

  @ApiPropertyOptional({ type: Object, description: 'Client-reported, untrusted metadata.' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

/** `POST /v1/exam-sessions/:id/participants/:studentId/extra-time` —
 * decision 2 (accommodations). */
export class GrantExtraTimeDto {
  @ApiProperty({
    type: Number,
    description: 'Additional seconds granted, added to Exam.durationSeconds at attempt creation.',
  })
  @IsInt()
  @Min(0)
  extraTimeSeconds!: number;
}
