import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EXAM_ACCESS_MODES,
  EXAM_NAVIGATION_POLICIES,
  MAX_EXAM_ATTEMPT_LIMIT,
  MAX_EXAM_DURATION_SECONDS,
  EXAM_READINESS_CHECK_CODES,
  EXAM_STATUSES,
  RESULT_DETAIL_VISIBILITIES,
  RESULT_POLICIES,
  type ExamAccessMode,
  type ExamNavigationPolicy,
  type ExamReadinessCheckCode,
  type ExamStatus,
  type ResultDetailVisibility,
  type ResultPolicy,
} from '@atlas/domain';

/** `POST /v1/exams` — exam identity (03 §25). `classIds` (`ClassGroup` ids,
 * resolved server-side to their `ClassSubject` rows for this subject+
 * session) is required, min 1: `exam.create`'s `ASSIGNED` scope gate is only
 * ever checked at creation (every later mutation is `OWNED`-only — see
 * `exam-scope.util.ts`'s own doc comment), so a teacher cannot create an
 * empty shell and add classes later with no scope check ever applied.
 * `departmentId` is deliberately absent — always derived server-side from
 * `Subject.departmentId`, never independently settable (mirrors `Exam
 * .departmentId`'s own schema doc comment). */
export class CreateExamDto {
  @ApiProperty({ type: String })
  @IsUUID()
  academicSessionId!: string;

  @ApiProperty({ type: String })
  @IsUUID()
  academicTermId!: string;

  @ApiProperty({ type: String })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty({
    type: String,
    maxLength: 64,
    description:
      'Free text (e.g. "First CA", "Mock Examination") — confirmed product decision, not a ' +
      'fixed platform vocabulary (2026-09-03).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  examType!: string;

  @ApiProperty({
    type: String,
    isArray: true,
    description:
      'ClassGroup ids this exam targets — at least one. All must share school, session, and ' +
      'level with each other and with this exam (ADR-0013).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  classIds!: string[];
}

/** `PATCH /v1/exams/:id` — DRAFT-only, every field optional (a partial
 * save, matching `UpdateQuestionRevisionDto`'s own precedent). When
 * `classIds` is given, it fully replaces the exam's targeted-class set;
 * when omitted but `subjectId`/`academicSessionId` changes, the existing
 * set is re-validated against the new values rather than silently cleared
 * (`AGENTS.md` §20: prefer preserving data over a shortcut) — a mismatch
 * asks the caller to also supply `classIds` in the same call. */
export class UpdateExamDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  academicSessionId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  academicTermId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ type: String, maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  examType?: string;

  @ApiPropertyOptional({ type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  classIds?: string[];
}

/** One entry of `PUT /v1/exams/:id/questions` — array position determines
 * `sequence` (1-based). `marks`, when omitted, defaults from the revision's
 * own `marks` at bind time (ADR-0029); when given, overrides it — either
 * way the value is freely reweightable while `DRAFT` and locks at
 * `READY`. */
export class ExamQuestionInputDto {
  @ApiProperty({ type: String })
  @IsUUID()
  questionRevisionId!: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    description: 'Overrides QuestionRevision.marks for this exam only. Omit to use the default.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  marks?: number;
}

/** `PUT /v1/exams/:id/questions` — always a full replace of the exam's
 * single default section's question set (never per-question add/remove),
 * matching `ReplaceTeacherAssignmentsDto`'s own established "full-replace,
 * not per-cell" precedent (F7). An empty array is valid — it clears the
 * selection, which the readiness check's `QUESTIONS_SELECTED` item then
 * correctly reports as failing. */
export class SetExamQuestionsDto {
  @ApiProperty({ type: ExamQuestionInputDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionInputDto)
  questions!: ExamQuestionInputDto[];
}

/** `PUT /v1/exams/:id/configuration` — every field independently optional
 * (a partial merge, despite the `PUT` verb — mirrors `PUT /v1/school
 * /branding`'s own established precedent in this codebase for a
 * multi-independent-knob resource) so a single UI control (e.g. just
 * "Randomize questions") can be toggled without resending every other
 * field. `resultPolicy`/`resultDetailVisibility` are pre-seeded from the
 * school's current values at creation (see `ExamService.create`'s own doc
 * comment) — this endpoint is what lets a teacher override them while
 * `DRAFT`. While `School.resultPolicyLocked` is on, a teacher or HOD may not
 * set either result setting to anything but the school's value (ADR-0010,
 * 2026-10-06 amendment). */
export class UpdateExamConfigurationDto {
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: MAX_EXAM_DURATION_SECONDS,
    description: 'Duration in whole seconds.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_EXAM_DURATION_SECONDS)
  durationSeconds?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: MAX_EXAM_ATTEMPT_LIMIT })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_EXAM_ATTEMPT_LIMIT)
  attemptLimit?: number;

  @ApiPropertyOptional({ type: String, enum: EXAM_NAVIGATION_POLICIES })
  @IsOptional()
  @IsIn(EXAM_NAVIGATION_POLICIES)
  navigationPolicy?: ExamNavigationPolicy;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  randomizeQuestions?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  randomizeOptions?: boolean;

  @ApiPropertyOptional({ type: String, enum: RESULT_POLICIES })
  @IsOptional()
  @IsIn(RESULT_POLICIES)
  resultPolicy?: ResultPolicy;

  @ApiPropertyOptional({ type: String, enum: RESULT_DETAIL_VISIBILITIES })
  @IsOptional()
  @IsIn(RESULT_DETAIL_VISIBILITIES)
  resultDetailVisibility?: ResultDetailVisibility;

  @ApiPropertyOptional({ type: String, enum: EXAM_ACCESS_MODES })
  @IsOptional()
  @IsIn(EXAM_ACCESS_MODES)
  accessMode?: ExamAccessMode;

  @ApiPropertyOptional({ type: String, description: '05 §71 — shown before the exam.' })
  @IsOptional()
  @IsString()
  generalInstructions?: string;

  @ApiPropertyOptional({ type: String, description: '05 §71 — navigation-specific.' })
  @IsOptional()
  @IsString()
  navigationInstructions?: string;

  @ApiPropertyOptional({ type: String, description: '05 §71 — submission-specific.' })
  @IsOptional()
  @IsString()
  submissionInstructions?: string;

  @ApiPropertyOptional({
    type: String,
    description: '05 §22 — free text, exam-level only; per-student grants are B12/B13.',
  })
  @IsOptional()
  @IsString()
  accommodations?: string;
}

/** `POST /v1/exams/:id/cancel` — mandatory reason (DoD item 7), matching
 * `RejectQuestionReviewDto`'s own `@IsNotEmpty()` precedent for a decorator
 * over a bespoke code. */
export class CancelExamDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ListExamsQueryDto {
  @ApiPropertyOptional({ type: String, enum: EXAM_STATUSES })
  @IsOptional()
  @IsIn(EXAM_STATUSES)
  status?: ExamStatus;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  academicSessionId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  academicTermId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ type: String, description: 'A targeted ClassGroup id.' })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ type: String, description: "The creating teacher's SchoolMembership id." })
  @IsOptional()
  @IsUUID()
  teacherMembershipId?: string;

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

export class ExamClassResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  classId!: string;

  @ApiProperty({ type: String })
  classSubjectId!: string;

  @ApiProperty({ type: String })
  className!: string;

  @ApiProperty({ type: String })
  level!: string;

  @ApiProperty({ type: String })
  arm!: string;
}

export class ExamQuestionResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  questionId!: string;

  @ApiProperty({ type: String })
  questionRevisionId!: string;

  @ApiProperty({ type: Number })
  sequence!: number;

  @ApiProperty({ type: Number })
  marks!: number;

  @ApiProperty({ type: String })
  content!: string;

  @ApiProperty({ type: String })
  questionType!: string;

  @ApiProperty({ type: String })
  difficulty!: string;

  @ApiProperty({ type: String, nullable: true })
  topicName!: string | null;
}

export class ExamSectionResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: Number })
  sequence!: number;

  @ApiProperty({
    type: Number,
    description: "Derived — SUM of this section's ExamQuestion.marks (ADR-0029), never stored.",
  })
  marks!: number;

  @ApiProperty({ type: ExamQuestionResponseDto, isArray: true })
  questions!: ExamQuestionResponseDto[];
}

export class ExamListItemResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  examType!: string;

  @ApiProperty({ type: String, enum: EXAM_STATUSES })
  status!: ExamStatus;

  @ApiProperty({ type: String })
  academicSessionId!: string;

  @ApiProperty({ type: String })
  sessionName!: string;

  @ApiProperty({ type: String })
  academicTermId!: string;

  @ApiProperty({ type: String })
  termName!: string;

  @ApiProperty({ type: String })
  subjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: String, nullable: true })
  departmentId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  departmentName!: string | null;

  @ApiProperty({ type: String })
  createdByMembershipId!: string;

  @ApiProperty({ type: String })
  createdByName!: string;

  @ApiProperty({ type: ExamClassResponseDto, isArray: true })
  classes!: ExamClassResponseDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class ExamResponseDto extends ExamListItemResponseDto {
  @ApiProperty({ type: Number })
  durationSeconds!: number;

  @ApiProperty({ type: Number })
  attemptLimit!: number;

  @ApiProperty({ type: String, enum: EXAM_NAVIGATION_POLICIES })
  navigationPolicy!: ExamNavigationPolicy;

  @ApiProperty({ type: Boolean })
  randomizeQuestions!: boolean;

  @ApiProperty({ type: Boolean })
  randomizeOptions!: boolean;

  @ApiProperty({ type: String, enum: RESULT_POLICIES })
  resultPolicy!: ResultPolicy;

  @ApiProperty({ type: String, enum: RESULT_DETAIL_VISIBILITIES })
  resultDetailVisibility!: ResultDetailVisibility;

  /** ADR-0010 (2026-10-06 amendment): the school has locked both result
   * settings. `resultPolicy`/`resultDetailVisibility` above are then the
   * school's values, and only a School Admin or Moderator may change them
   * on an exam. */
  @ApiProperty({ type: Boolean })
  resultSettingsLocked!: boolean;

  @ApiProperty({ type: String, enum: EXAM_ACCESS_MODES })
  accessMode!: ExamAccessMode;

  @ApiProperty({ type: String, nullable: true })
  generalInstructions!: string | null;

  @ApiProperty({ type: String, nullable: true })
  navigationInstructions!: string | null;

  @ApiProperty({ type: String, nullable: true })
  submissionInstructions!: string | null;

  @ApiProperty({ type: String, nullable: true })
  accommodations!: string | null;

  @ApiProperty({ type: String, nullable: true })
  cancelledReason!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  cancelledAt!: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  archivedAt!: string | null;

  @ApiProperty({ type: ExamSectionResponseDto, isArray: true })
  sections!: ExamSectionResponseDto[];
}

export class ExamListResponseDto {
  @ApiProperty({ type: ExamListItemResponseDto, isArray: true })
  exams!: ExamListItemResponseDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
}

export class ExamReadinessCheckItemDto {
  @ApiProperty({ type: String, enum: EXAM_READINESS_CHECK_CODES })
  code!: ExamReadinessCheckCode;

  @ApiProperty({ type: String })
  label!: string;

  @ApiProperty({ type: Boolean })
  passed!: boolean;

  @ApiProperty({ type: String })
  message!: string;
}

/** `GET /v1/exams/:id/readiness` — every check individually pass/fail
 * (05 §72), never a single boolean. `ready` is the AND of every `checks[]`
 * item — the exact predicate `POST .../ready` re-evaluates before
 * transitioning. */
export class ExamReadinessResponseDto {
  @ApiProperty({ type: String })
  examId!: string;

  @ApiProperty({ type: Boolean })
  ready!: boolean;

  @ApiProperty({ type: ExamReadinessCheckItemDto, isArray: true })
  checks!: ExamReadinessCheckItemDto[];
}
