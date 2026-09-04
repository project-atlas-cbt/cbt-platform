import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CLASS_LEVELS,
  QUESTION_DIFFICULTIES,
  QUESTION_REVISION_STATUSES,
  QUESTION_TYPES,
  type ClassLevel,
  type QuestionDifficulty,
  type QuestionRevisionStatus,
  type QuestionType,
} from '@atlas/domain';

/** `06 §27` — never four hardcoded A/B/C/D fields; an array, not fixed
 * columns. The DTO caps it at 4 entries (below) — not a schema limit
 * (`QuestionOption` itself is unbounded) but an API-input constraint, so
 * every question created interactively stays consistent with the fixed
 * 4-column CSV shape `GET /v1/questions/export`/the QUESTIONS import
 * template both use throughout this phase; without it, a >4-option
 * question would silently lose its extra options (and possibly its
 * correct-answer flag entirely) on export. A `PATCH`/new-revision body's
 * `options` array is always a full replace (never per-option editing) —
 * `id`, when supplied, is validated to actually belong to the revision
 * being edited before the replace runs, the closest schema-faithful
 * equivalent of DoD item 8's "correct answer references a non-existent
 * option" (07 §7.3 stores `correctFlag` per-option, not a separate
 * correct-answer pointer field) — see `question-revision.service.ts`'s
 * `replaceOptions`. */
export class QuestionOptionInputDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Omit for a new option; include to reference an existing one of this revision.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ type: String })
  @IsString()
  content!: string;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  correctFlag!: boolean;
}

/** `POST /v1/questions` — creates the `Question` + its initial `DRAFT`
 * revision + options in one transaction. Full validation (DoD item 8) runs
 * here, matching DoD item 1's own worked example of a complete, valid MCQ
 * being created in one step — unlike a later `PATCH`, which may
 * legitimately leave a draft transiently incomplete (DoD item 3). */
export class CreateQuestionDto {
  @ApiProperty({ type: String })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ type: String, enum: CLASS_LEVELS })
  @IsIn(CLASS_LEVELS)
  level!: ClassLevel;

  @ApiProperty({ type: String, enum: QUESTION_TYPES })
  @IsIn(QUESTION_TYPES)
  questionType!: QuestionType;

  @ApiProperty({ type: String })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ type: String, description: 'A pre-resolved Topic id.' })
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: 128,
    description:
      'Free-text topic name, resolved case-insensitively and auto-created on first use ' +
      '(ADR-0001 §3 / DoD item 9) — ignored if topicId is also given.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  topicName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  subtopicId?: string;

  @ApiPropertyOptional({ type: String, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  subtopicName?: string;

  @ApiProperty({ type: String, enum: QUESTION_DIFFICULTIES })
  @IsIn(QUESTION_DIFFICULTIES)
  difficulty!: QuestionDifficulty;

  @ApiProperty({ type: Number, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  marks!: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiProperty({ type: QuestionOptionInputDto, isArray: true, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options!: QuestionOptionInputDto[];
}

/** `PATCH /v1/questions/:id/revisions/:rev` — draft-only, every field
 * optional (a partial save). `options`, when given, is a full-array
 * replace (never per-option PATCH), matching the DTO the create endpoint
 * already uses. */
export class UpdateQuestionRevisionDto {
  @ApiPropertyOptional({ type: String, enum: QUESTION_TYPES })
  @IsOptional()
  @IsIn(QUESTION_TYPES)
  questionType?: QuestionType;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiPropertyOptional({ type: String, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  topicName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  subtopicId?: string;

  @ApiPropertyOptional({ type: String, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  subtopicName?: string;

  @ApiPropertyOptional({ type: String, enum: QUESTION_DIFFICULTIES })
  @IsOptional()
  @IsIn(QUESTION_DIFFICULTIES)
  difficulty?: QuestionDifficulty;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  marks?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ type: QuestionOptionInputDto, isArray: true, maxItems: 4 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options?: QuestionOptionInputDto[];
}

/** `POST /v1/questions/:id/revisions` — starts a new revision cloned from
 * the current one (must be `APPROVED` or `REJECTED` — DoD items 5/7), with
 * any subset of fields optionally overridden in the same call (equivalent
 * to clone-then-immediate-PATCH in one request). */
export class CreateRevisionDto extends UpdateQuestionRevisionDto {}

export class QuestionOptionResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: Number })
  originalOrder!: number;

  @ApiProperty({ type: Boolean })
  correctFlag!: boolean;
}

export class QuestionMediaItemResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  mediaAssetId!: string;

  @ApiProperty({ type: String, description: "The joined MediaAsset's own type." })
  mediaType!: string;

  @ApiProperty({ type: Number })
  displayOrder!: number;
}

export class QuestionRevisionResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: Number })
  revisionNumber!: number;

  @ApiProperty({ type: String, enum: QUESTION_TYPES })
  questionType!: QuestionType;

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: String, nullable: true })
  topicId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  topicName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  subtopicId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  subtopicName!: string | null;

  @ApiProperty({ type: String, enum: QUESTION_DIFFICULTIES })
  difficulty!: QuestionDifficulty;

  @ApiProperty({ type: Number })
  marks!: number;

  @ApiProperty({ type: String, nullable: true })
  explanation!: string | null;

  @ApiProperty({ type: String })
  createdByMembershipId!: string;

  @ApiProperty({ type: String, enum: QUESTION_REVISION_STATUSES })
  status!: QuestionRevisionStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: QuestionOptionResponseDto, isArray: true })
  options!: QuestionOptionResponseDto[];

  @ApiProperty({ type: QuestionMediaItemResponseDto, isArray: true })
  media!: QuestionMediaItemResponseDto[];
}

/** D-12: `currentStatus` is always derived (see `question.service.ts`'s
 * own `deriveCurrentStatus`), never a stored column. */
const QUESTION_CURRENT_STATUSES = [...QUESTION_REVISION_STATUSES, 'ARCHIVED'] as const;

export class QuestionListItemResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  subjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: String, enum: CLASS_LEVELS })
  level!: ClassLevel;

  @ApiProperty({ type: String, nullable: true })
  topicId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  topicName!: string | null;

  /** F11 gap-closure: the id a caller actually needs to *bind* this question
   * to an exam (`ExamQuestionInputDto.questionRevisionId`) — the list item's
   * own `id` above is the parent `Question`'s id, not a revision's. Always
   * present in practice for anything returned by `GET /exams/:id/
   * available-questions` (server-filtered to `status: 'APPROVED'`, so
   * `currentRevision` is always the approved one there); nullable in
   * general since a question can exist with no revision at all in principle. */
  @ApiProperty({ type: String, nullable: true })
  currentRevisionId!: string | null;

  @ApiProperty({ type: String, enum: QUESTION_DIFFICULTIES })
  difficulty!: QuestionDifficulty;

  @ApiProperty({ type: Number })
  marks!: number;

  @ApiProperty({ type: String, enum: QUESTION_TYPES })
  questionType!: QuestionType;

  @ApiProperty({ type: String, enum: QUESTION_CURRENT_STATUSES })
  currentStatus!: (typeof QUESTION_CURRENT_STATUSES)[number];

  @ApiProperty({ type: String })
  authorTeacherProfileId!: string;

  @ApiProperty({ type: String })
  authorName!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class QuestionResponseDto extends QuestionListItemResponseDto {
  @ApiProperty({ type: String, nullable: true })
  archivedAt!: string | null;

  @ApiProperty({
    type: QuestionRevisionResponseDto,
    isArray: true,
    description: 'Full revision history, oldest first — never mutated once APPROVED.',
  })
  revisions!: QuestionRevisionResponseDto[];
}

export class QuestionListResponseDto {
  @ApiProperty({ type: QuestionListItemResponseDto, isArray: true })
  questions!: QuestionListItemResponseDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
}

export class ListQuestionsQueryDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ type: String, enum: CLASS_LEVELS })
  @IsOptional()
  @IsIn(CLASS_LEVELS)
  level?: ClassLevel;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiPropertyOptional({ type: String, enum: QUESTION_DIFFICULTIES })
  @IsOptional()
  @IsIn(QUESTION_DIFFICULTIES)
  difficulty?: QuestionDifficulty;

  @ApiPropertyOptional({ type: String, enum: QUESTION_CURRENT_STATUSES })
  @IsOptional()
  @IsIn(QUESTION_CURRENT_STATUSES)
  status?: (typeof QUESTION_CURRENT_STATUSES)[number];

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class QuestionCountsResponseDto {
  @ApiProperty({ type: Number })
  draft!: number;

  @ApiProperty({ type: Number })
  submitted!: number;

  @ApiProperty({ type: Number })
  underReview!: number;

  @ApiProperty({ type: Number })
  approved!: number;

  @ApiProperty({ type: Number })
  rejected!: number;

  @ApiProperty({ type: Number })
  archived!: number;
}

export class AttachQuestionMediaDto {
  @ApiProperty({
    type: String,
    description: 'A completed (READY) QUESTION_IMAGE/DIAGRAM asset id.',
  })
  @IsUUID()
  mediaAssetId!: string;

  @ApiProperty({ type: Number })
  @IsInt()
  @Min(0)
  displayOrder!: number;
}

export class TopicResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  subjectId!: string;

  @ApiProperty({ type: String, nullable: true })
  parentTopicId!: string | null;

  @ApiProperty({ type: String })
  name!: string;
}

export class TopicListResponseDto {
  @ApiProperty({ type: TopicResponseDto, isArray: true })
  topics!: TopicResponseDto[];
}

export class ListTopicsQueryDto {
  @ApiProperty({ type: String })
  @IsUUID()
  subjectId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  parentTopicId?: string;
}

export class CreateTopicDto {
  @ApiProperty({ type: String })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ type: String, maxLength: 128 })
  @IsString()
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  parentTopicId?: string;
}

const QUESTION_MEDIA_UPLOADABLE_TYPES = ['QUESTION_IMAGE', 'QUESTION_DIAGRAM'] as const;
export type QuestionMediaUploadableType = (typeof QUESTION_MEDIA_UPLOADABLE_TYPES)[number];

/** `POST /v1/questions/media/upload-target` — the dedicated route that
 * closes `media.upload`'s ASSIGNED-scope gap (see this module's own doc
 * comment): `subjectId`+`level` let the service run the same ADR-0001
 * TeacherAssignment join question creation itself uses, before any
 * `Question`/`QuestionRevision` exists yet. */
export class RequestQuestionMediaUploadDto {
  @ApiProperty({ type: String, enum: QUESTION_MEDIA_UPLOADABLE_TYPES })
  @IsIn(QUESTION_MEDIA_UPLOADABLE_TYPES)
  type!: QuestionMediaUploadableType;

  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ type: String })
  @IsString()
  declaredMimeType!: string;

  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  declaredSizeBytes!: number;

  @ApiProperty({ type: String })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ type: String, enum: CLASS_LEVELS })
  @IsIn(CLASS_LEVELS)
  level!: ClassLevel;
}
