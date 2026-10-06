import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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

const ATTEMPT_MARKING_STATUSES = ['NOT_APPLICABLE', 'PENDING', 'COMPLETE'] as const;
type AttemptMarkingStatus = (typeof ATTEMPT_MARKING_STATUSES)[number];

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

  @ApiProperty({
    type: Number,
    description:
      "F20 (DoD 3): the caller's own staff-granted extra time for this exam, in seconds (0 when none) — already included in the attempt's server deadline at Start; shown so the student knows.",
  })
  extraTimeSeconds!: number;

  @ApiProperty({
    type: Boolean,
    description: "F20 (DoD 3): the caller's staff-granted larger-text accommodation (07 §9.7).",
  })
  largerText!: boolean;
}

/** F20 — one encrypted media object a lab pre-caches before Start. */
export class MediaManifestAssetDto {
  @ApiProperty({ type: String })
  mediaAssetId!: string;

  @ApiProperty({ type: String, description: 'Short-lived signed URL of the CIPHERTEXT object.' })
  url!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: Number, description: 'Ciphertext size: 12-byte IV + body + 16-byte tag.' })
  byteSize!: number;

  @ApiProperty({ type: String, description: 'Hex SHA-256 of the ciphertext object.' })
  sha256!: string;
}

/** `GET /v1/student/assessment/:examId/media-manifest` (F20, ADR-0021
 * amendment). Never carries the decryption key — that arrives only in the
 * attempt package at Start. */
export class MediaManifestResponseDto {
  @ApiProperty({
    type: Boolean,
    description: 'false while the server is still encrypting — poll after retryAfterSeconds.',
  })
  ready!: boolean;

  @ApiProperty({ type: Number })
  totalBytes!: number;

  @ApiProperty({ type: Number, nullable: true })
  retryAfterSeconds!: number | null;

  @ApiProperty({ type: MediaManifestAssetDto, isArray: true })
  assets!: MediaManifestAssetDto[];
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

  /** F13 gap closure (2026-09-05): `null` unless `state` is `INVALIDATED` or
   * `CANCELLED` — lets a student who reloads/resumes into a terminated
   * attempt see the real reason (`AttemptStateResponseDto` already exposed
   * this for the direct submit/end response; `resume()`/`start()` never
   * did, leaving the client's own `InvalidatedScreen` structurally unable
   * to show anything but a hardcoded generic message). */
  @ApiPropertyOptional({ type: String, nullable: true })
  invalidationReason?: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'F20 (ADR-0021 amendment): base64 AES-256-GCM key that decrypts the pre-cached media of this exam. Present only to the attempt owner while the attempt is IN_PROGRESS; null otherwise.',
  })
  mediaKey!: string | null;

  @ApiProperty({
    type: Number,
    description: 'F20 (DoD 3): staff-granted extra time already included in expiresAt, in seconds.',
  })
  extraTimeSeconds!: number;

  @ApiProperty({
    type: Boolean,
    description: 'F20 (DoD 3): staff-granted larger-text accommodation.',
  })
  largerText!: boolean;
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

/** `marking` half of `GET /v1/attempts/:id/status` — B14. Deliberately NOT
 * a `Result` view (that entity doesn't exist until B15 — this phase's own
 * confirmed decision): every field here is a live aggregate over
 * `AttemptQuestionResult` rows, computed on read, never persisted. */
/** No marks or counts (2026-10-06): a student reads this straight after
 * submitting, before any release. Scores reach students only through
 * `student-results.v1`, gated by ADR-0010's publication and visibility
 * rules; 04 §59 says this screen shows only that the result will follow
 * the school's result policy. */
export class AttemptMarkingStatusDto {
  @ApiProperty({
    type: String,
    enum: ATTEMPT_MARKING_STATUSES,
    description:
      'NOT_APPLICABLE while the attempt is still IN_PROGRESS (or was invalidated/cancelled — never submitted); PENDING once finalized but not yet fully marked (the queued marking job has not completed); COMPLETE once every question has a recorded result.',
  })
  status!: AttemptMarkingStatus;

  @ApiProperty({ type: Number })
  questionCount!: number;

  @ApiProperty({ type: Number })
  markedCount!: number;
}

/** `GET /v1/attempts/:id/status` — B14. Post-submission status for the
 * confirmation screen (04 §59) — a technical extension of `resume()`'s own
 * "view my own attempt" capability, gated by the same `studentCbt.resume`
 * permission (no separately-named "view submission status" capability
 * exists in `02`'s matrix). Opportunistically finalizes an expired attempt
 * before reporting (ADR-0004), the same as every other touchpoint in this
 * module. */
export class AttemptStatusResponseDto {
  @ApiProperty({ type: String })
  attemptId!: string;

  @ApiProperty({ type: String })
  examId!: string;

  @ApiProperty({ type: String, enum: ATTEMPT_STATES })
  state!: AttemptState;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  submittedAt!: string | null;

  @ApiProperty({ type: AttemptMarkingStatusDto })
  marking!: AttemptMarkingStatusDto;
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

/** `POST /v1/exam-sessions/:id/participants/:studentId/larger-text` — F20
 * (DoD 3): the LARGER_TEXT accommodation (07 §9.7), staff-granted. */
export class GrantLargerTextDto {
  @ApiProperty({ type: Boolean, description: 'true grants, false withdraws.' })
  @IsBoolean()
  largerText!: boolean;
}

/** `POST /v1/attempts/:id/heartbeat`. Audit P1-5: carries the server's clock
 * so the client re-anchors its exam countdown on every heartbeat
 * (`apps/web/lib/attempt/server-clock.ts`). */
export class HeartbeatResponseDto {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({
    format: 'date-time',
    description:
      "The server's current clock. The client counts the exam countdown from it on its own monotonic clock, never from the PC's wall clock.",
  })
  serverTime!: string;
}
