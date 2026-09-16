import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import {
  RESULT_ADJUSTMENT_TYPES,
  RESULT_STATES,
  type ResultAdjustmentType,
  type ResultState,
} from '@atlas/domain';

/** `GET /v1/exams/:id/results` — server-side filter/sort/paginate. */
export class ListExamResultsQueryDto {
  @ApiPropertyOptional({ type: String, description: 'Student name or student ID substring.' })
  @IsOptional()
  @IsString()
  q?: string;

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
  @ApiProperty({ type: String, nullable: true }) voidedReason!: string | null;
  @ApiProperty({ type: String, nullable: true }) finalizedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) submittedAt!: string | null;
  @ApiProperty({ type: String }) attemptState!: string;
}

/** Staff exam header. Participation totals are not inferred from result rows. */
export class ExamResultSummaryDto {
  @ApiProperty({ type: Number }) studentCount!: number;
  @ApiProperty({ type: Number }) absentCount!: number;
  @ApiProperty({ type: Number }) resultCount!: number;
  @ApiProperty({ type: Number }) voidedCount!: number;
  @ApiProperty({ type: Number }) pendingCount!: number;
  @ApiProperty({ type: Number, nullable: true }) averagePercentage!: number | null;
  @ApiProperty({ type: Number, nullable: true }) highestPercentage!: number | null;
  @ApiProperty({ type: Number, nullable: true }) lowestPercentage!: number | null;
  @ApiProperty({ type: Number, nullable: true }) passRate!: number | null;
}

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
  @ApiProperty({ type: [ExamResultClassSummaryDto] }) classSummaries!: ExamResultClassSummaryDto[];
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
  @ApiProperty({ type: [ResultQuestionBreakdownDto] }) questions!: ResultQuestionBreakdownDto[];
  @ApiProperty({ type: [ResultAdjustmentHistoryItemDto] }) adjustments!: ResultAdjustmentHistoryItemDto[];
}

export class ResultPublicationResponseDto {
  @ApiProperty({ type: String }) examId!: string;
  @ApiProperty({ enum: ['PUBLISHED', 'UNPUBLISHED'] }) status!: 'PUBLISHED' | 'UNPUBLISHED';
  @ApiProperty({ type: String, nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: String, nullable: true }) publishedByName!: string | null;
  @ApiProperty({ type: String, nullable: true }) unpublishedAt!: string | null;
  @ApiProperty({ type: Boolean }) adjustmentInProgress!: boolean;
  @ApiProperty({ type: Number }) affectedResultCount!: number;
}

export class PublishResultsDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UnpublishResultsDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class WithholdResultDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CreateResultAdjustmentDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  examId!: string;

  @ApiProperty({ enum: RESULT_ADJUSTMENT_TYPES })
  @IsIn(RESULT_ADJUSTMENT_TYPES)
  type!: ResultAdjustmentType;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetExamQuestionId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  markDelta?: number;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetResultId?: string;

  @ApiPropertyOptional({ type: Number })
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
