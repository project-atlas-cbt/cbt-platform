import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import {
  RESULT_ADJUSTMENT_TYPES,
  RESULT_STATES,
  type ResultAdjustmentType,
  type ResultState,
} from '@atlas/domain';

/** `GET /v1/exams/:id/results` — server-side filter/sort/paginate, mirroring
 * `ListSchoolsQueryDto`/`ListPeopleQueryDto`'s established shape. */
export class ListExamResultsQueryDto {
  @ApiPropertyOptional({ type: String, description: 'Student name or student ID substring.' })
  @IsOptional()
  @IsString()
  q?: string;

  /** ADR-0013: an exam may target several classes, so results aggregate
   * across the whole exam with a per-class breakdown available. */
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ enum: RESULT_STATES })
  @IsOptional()
  @IsIn(RESULT_STATES)
  state?: ResultState;

  @ApiPropertyOptional({ type: Number, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, default: 25, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({ enum: ['studentName', 'percentage', 'earnedMarks', 'finalizedAt'] })
  @IsOptional()
  @IsIn(['studentName', 'percentage', 'earnedMarks', 'finalizedAt'])
  sortBy?: 'studentName' | 'percentage' | 'earnedMarks' | 'finalizedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}

export class ResultListItemDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) attemptId!: string;
  @ApiProperty({ type: String }) studentProfileId!: string;
  @ApiProperty({ type: String }) studentName!: string;
  @ApiProperty({ type: String }) studentIdentifier!: string;

  @ApiProperty({ type: String, nullable: true }) classId!: string | null;
  @ApiProperty({ type: String, nullable: true }) className!: string | null;

  @ApiProperty({ enum: RESULT_STATES }) state!: ResultState;

  @ApiProperty({ type: Number }) totalMarks!: number;
  @ApiProperty({ type: Number }) earnedMarks!: number;
  @ApiProperty({ type: Number }) percentage!: number;
  @ApiProperty({ type: Number }) correctCount!: number;
  @ApiProperty({ type: Number }) incorrectCount!: number;
  @ApiProperty({ type: Number }) unansweredCount!: number;
  @ApiProperty({ type: Number }) partialCount!: number;

  @ApiProperty({ type: String, nullable: true }) grade!: string | null;

  @ApiProperty({ type: Boolean }) withheld!: boolean;
  @ApiProperty({ type: String, nullable: true }) withheldReason!: string | null;

  /** ADR-0025: a VOIDED result stays visible to authorized staff WITH the
   * invalidation reason attached. Read from the attempt (the one source of
   * truth for why it was invalidated), never duplicated onto the result. */
  @ApiProperty({ type: String, nullable: true }) voidedReason!: string | null;

  @ApiProperty({ type: String, nullable: true }) finalizedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) submittedAt!: string | null;

  /** 05 §54: exports and lists preserve real attempt status rather than
   * converting everything into zeros. */
  @ApiProperty({ type: String }) attemptState!: string;
}

/** 04 §48's exam header block: "40 Students / 37 Completed / 3 Absent /
 * Average: 68.7% / Highest: 94% / Lowest: 31%". Every figure excludes
 * VOIDED results (ADR-0025) and counts only finalised ones. */
export class ExamResultSummaryDto {
  @ApiProperty({ type: Number }) resultCount!: number;
  @ApiProperty({ type: Number }) voidedCount!: number;
  @ApiProperty({ type: Number }) pendingCount!: number;
  @ApiProperty({ type: Number, nullable: true }) averagePercentage!: number | null;
  @ApiProperty({ type: Number, nullable: true }) highestPercentage!: number | null;
  @ApiProperty({ type: Number, nullable: true }) lowestPercentage!: number | null;

  /** `null` when no grading scale with pass bands applies — 05 §55.1 asks
   * for a pass rate but no specification defines a threshold, so B15
   * derives it from the frozen grading scale and reports nothing rather
   * than inventing a cut-off when none is configured. */
  @ApiProperty({ type: Number, nullable: true }) passRate!: number | null;
}

/** ADR-0013's per-class breakdown, alongside the whole-exam aggregate. */
export class ExamResultClassSummaryDto extends ExamResultSummaryDto {
  @ApiProperty({ type: String }) classId!: string;
  @ApiProperty({ type: String }) className!: string;
}

export class ExamResultsResponseDto {
  @ApiProperty({ type: [ResultListItemDto] }) items!: ResultListItemDto[];
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: Number }) page!: number;
  @ApiProperty({ type: Number }) pageSize!: number;
  @ApiProperty({ type: ExamResultSummaryDto }) summary!: ExamResultSummaryDto;
  @ApiProperty({ type: [ExamResultClassSummaryDto] })
  classSummaries!: ExamResultClassSummaryDto[];
  @ApiProperty({ type: Boolean }) published!: boolean;
  @ApiProperty({ type: Boolean }) adjustmentInProgress!: boolean;
}

export class ResultQuestionBreakdownDto {
  @ApiProperty({ type: String }) examQuestionId!: string;
  @ApiProperty({ type: Number }) displaySequence!: number;
  @ApiProperty({ type: String }) content!: string;
  @ApiProperty({ type: String }) correctness!: string;
  @ApiProperty({ type: Number }) awardedMarks!: number;
  @ApiProperty({ type: Number }) maximumMarks!: number;

  /** `true` when an adjustment excluded this question from the score. */
  @ApiProperty({ type: Boolean }) voided!: boolean;
}

export class ResultAdjustmentHistoryItemDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) operationId!: string;
  @ApiProperty({ enum: RESULT_ADJUSTMENT_TYPES }) adjustmentType!: ResultAdjustmentType;
  @ApiProperty({ type: String }) reason!: string;
  @ApiProperty({ type: String }) authorizedByName!: string;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: Object }) oldValue!: Record<string, unknown>;
  @ApiProperty({ type: Object }) newValue!: Record<string, unknown>;
}

export class ResultDetailResponseDto extends ResultListItemDto {
  @ApiProperty({ type: String }) examId!: string;
  @ApiProperty({ type: String }) examTitle!: string;
  @ApiProperty({ type: String }) subjectName!: string;
  @ApiProperty({ type: String, nullable: true }) gradingScaleVersionId!: string | null;

  @ApiProperty({ type: [ResultQuestionBreakdownDto] })
  questions!: ResultQuestionBreakdownDto[];

  /** The append-only history (07 §10.2). Its earliest entry's `oldValue` is
   * the original finalised result (07 §38, DoD item 12). */
  @ApiProperty({ type: [ResultAdjustmentHistoryItemDto] })
  adjustments!: ResultAdjustmentHistoryItemDto[];
}

export class ResultPublicationResponseDto {
  @ApiProperty({ type: String }) examId!: string;
  @ApiProperty({ enum: ['PUBLISHED', 'UNPUBLISHED'] }) status!: 'PUBLISHED' | 'UNPUBLISHED';
  @ApiProperty({ type: String, nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) publishedByName!: string | null;
  @ApiProperty({ type: String, nullable: true }) unpublishedAt!: string | null;
  @ApiProperty({ type: Boolean }) adjustmentInProgress!: boolean;
  @ApiProperty({ type: Number, description: 'Results this action made visible or hid.' })
  affectedResultCount!: number;
}

/** 05 §65: "Result publication needs reversal → Unpublish with audit
 * record." A reason is optional on publish (the ordinary release of a
 * finished cohort) and mandatory on unpublish (withdrawing something
 * students may already have seen). */
export class PublishResultsDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UnpublishResultsDto {
  @ApiProperty({ type: String, description: 'Mandatory — recorded in the audit trail.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** ADR-0010's individual-withholding action. */
export class WithholdResultDto {
  @ApiProperty({ type: String, description: 'Mandatory — why this result is held back.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CreateResultAdjustmentDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'The exam being adjusted.' })
  @IsUUID()
  examId!: string;

  @ApiProperty({ enum: RESULT_ADJUSTMENT_TYPES })
  @IsIn(RESULT_ADJUSTMENT_TYPES)
  type!: ResultAdjustmentType;

  @ApiProperty({ type: String, description: 'Mandatory for every adjustment type (07 §34).' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'VOID_QUESTION only — the ExamQuestion excluded from every affected result.',
  })
  @IsOptional()
  @IsUUID()
  targetExamQuestionId?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'AWARD_MARK/DEDUCT_MARK only — magnitude, always positive.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  markDelta?: number;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'MANUAL_OVERRIDE only — the single result being overridden.',
  })
  @IsOptional()
  @IsUUID()
  targetResultId?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'MANUAL_OVERRIDE only — the earned-marks value set outright.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  overrideEarnedMarks?: number;
}

export class ResultAdjustmentOperationResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) examId!: string;
  @ApiProperty({ enum: RESULT_ADJUSTMENT_TYPES }) type!: ResultAdjustmentType;
  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] })
  status!: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  @ApiProperty({ type: String }) reason!: string;
  @ApiProperty({ type: Number }) totalCount!: number;
  @ApiProperty({ type: Number }) appliedCount!: number;
  @ApiProperty({ type: Number }) failedCount!: number;
  @ApiProperty({ type: String, nullable: true }) failureReason!: string | null;
  @ApiProperty({ type: String }) createdByName!: string;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) completedAt!: string | null;
}
