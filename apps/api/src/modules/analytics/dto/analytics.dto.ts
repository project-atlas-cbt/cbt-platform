import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/** Shared, deliberately small academic-context filter.  The service verifies
 * every supplied id belongs to the tenant and that a term belongs to its
 * session; query identifiers are never treated as authority. */
export class AnalyticsContextQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  academicSessionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  academicTermId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class ClassAnalyticsQueryDto extends AnalyticsContextQueryDto {}

export class PercentageMetricDto {
  @ApiProperty({ type: Number, nullable: true }) averagePercentage!: number | null;
  @ApiProperty({ type: Number, nullable: true }) highestPercentage!: number | null;
  @ApiProperty({ type: Number, nullable: true }) lowestPercentage!: number | null;
  @ApiProperty({ type: Number, nullable: true }) passRate!: number | null;
  @ApiProperty({ type: Number }) resultCount!: number;
}

export class ParticipationMetricDto {
  @ApiProperty({ type: Number }) expectedStudentCount!: number;
  @ApiProperty({ type: Number }) attendedCount!: number;
  @ApiProperty({ type: Number }) absentCount!: number;
  @ApiProperty({ type: Number }) pendingCount!: number;
  @ApiProperty({ type: Number, nullable: true }) completionRate!: number | null;
}

export class PercentageDistributionBucketDto {
  @ApiProperty({ type: Number }) lowerBound!: number;
  @ApiProperty({ type: Number }) upperBound!: number;
  @ApiProperty({ type: Number }) count!: number;
  @ApiProperty({ type: Number, nullable: true }) percentage!: number | null;
}

export class ExamAnalyticsClassDto extends PercentageMetricDto {
  @ApiProperty() classId!: string;
  @ApiProperty() className!: string;
  @ApiProperty({ type: ParticipationMetricDto }) participation!: ParticipationMetricDto;
}

export class ExamAnalyticsResponseDto extends PercentageMetricDto {
  @ApiProperty() examId!: string;
  @ApiProperty() voidedResultCount!: number;
  @ApiProperty({ type: ParticipationMetricDto }) participation!: ParticipationMetricDto;
  @ApiProperty({ type: [PercentageDistributionBucketDto] })
  distribution!: PercentageDistributionBucketDto[];
  @ApiProperty({ type: [ExamAnalyticsClassDto] }) classBreakdown!: ExamAnalyticsClassDto[];
}

export class QuestionPerformanceDto {
  @ApiProperty({ type: String }) examQuestionId!: string;
  @ApiProperty({ type: Number }) sequence!: number;
  @ApiProperty({ type: String }) questionId!: string;
  @ApiProperty({ type: String }) questionType!: string;
  @ApiProperty({ type: String }) subjectId!: string;
  @ApiProperty({ type: String, nullable: true }) topicName!: string | null;
  @ApiProperty({ type: Number }) exposureCount!: number;
  @ApiProperty({ type: Number }) correctCount!: number;
  @ApiProperty({ type: Number }) incorrectCount!: number;
  @ApiProperty({ type: Number }) unansweredCount!: number;
  @ApiProperty({ type: Number }) correctRate!: number;
  @ApiProperty({ type: Number }) incorrectRate!: number;
  @ApiProperty({ type: Number }) unansweredRate!: number;
  @ApiProperty({ type: Boolean }) voidedForScoring!: boolean;
}

export class QuestionAnalyticsResponseDto {
  @ApiProperty() examId!: string;
  @ApiProperty({ type: [QuestionPerformanceDto] }) items!: QuestionPerformanceDto[];
}

export class ComparisonMetricDto extends PercentageMetricDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
}

export class AnalyticsTrendDto extends PercentageMetricDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: ParticipationMetricDto }) participation!: ParticipationMetricDto;
  @ApiProperty({ type: Number }) examCount!: number;
  @ApiProperty({ type: Number }) attemptCount!: number;
}

export class ClassAnalyticsResponseDto extends PercentageMetricDto {
  @ApiProperty({ type: String }) classId!: string;
  @ApiProperty({ type: ParticipationMetricDto }) participation!: ParticipationMetricDto;
  @ApiProperty({ type: [ComparisonMetricDto] }) subjects!: ComparisonMetricDto[];
  @ApiProperty({ type: [ComparisonMetricDto] }) exams!: ComparisonMetricDto[];
}

export class DepartmentAnalyticsResponseDto extends PercentageMetricDto {
  @ApiProperty({ type: String }) departmentId!: string;
  @ApiProperty({ type: [ComparisonMetricDto] }) subjects!: ComparisonMetricDto[];
  @ApiProperty({ type: [ComparisonMetricDto] }) classes!: ComparisonMetricDto[];
  @ApiProperty({ type: [ComparisonMetricDto] }) exams!: ComparisonMetricDto[];
  @ApiProperty({ type: [AnalyticsTrendDto] }) termTrends!: AnalyticsTrendDto[];
}

export class SchoolAnalyticsResponseDto extends PercentageMetricDto {
  @ApiProperty({ type: ParticipationMetricDto }) participation!: ParticipationMetricDto;
  @ApiProperty({ type: Number }) examCount!: number;
  @ApiProperty({ type: Number }) attemptCount!: number;
  @ApiProperty({ type: [ComparisonMetricDto] }) departments!: ComparisonMetricDto[];
  @ApiProperty({ type: [AnalyticsTrendDto] }) sessionTrends!: AnalyticsTrendDto[];
}

export class StudentAnalyticsHistoryItemDto {
  @ApiProperty({ type: String }) examId!: string;
  @ApiProperty({ type: String }) examTitle!: string;
  @ApiProperty({ type: String }) subjectName!: string;
  @ApiProperty({ type: Number }) percentage!: number;
  @ApiProperty({ type: String, nullable: true }) grade!: string | null;
  @ApiProperty({ type: String, nullable: true }) finalizedAt!: string | null;
}

export class StudentAnalyticsResponseDto extends PercentageMetricDto {
  @ApiProperty({ type: String }) studentProfileId!: string;
  @ApiProperty({ type: [StudentAnalyticsHistoryItemDto] })
  history!: StudentAnalyticsHistoryItemDto[];
}

export class PlatformAnalyticsTrendDto {
  @ApiProperty({ type: String }) month!: string;
  @ApiProperty({ type: Number }) schoolsCreated!: number;
  @ApiProperty({ type: Number }) examsCreated!: number;
  @ApiProperty({ type: Number }) attemptsStarted!: number;
}

export class PlatformAnalyticsResponseDto {
  @ApiProperty({ type: Number }) totalSchools!: number;
  @ApiProperty({ type: Number }) activeSchools!: number;
  @ApiProperty({ type: Number }) provisionalSchools!: number;
  @ApiProperty({ type: Number }) suspendedSchools!: number;
  @ApiProperty({ type: Number }) expiredSchools!: number;
  @ApiProperty({ type: Number }) deactivatedSchools!: number;
  @ApiProperty({ type: Number }) pendingSubscriptions!: number;
  @ApiProperty({ type: Number }) activeSubscriptions!: number;
  @ApiProperty({ type: Number }) expiringSubscriptions!: number;
  @ApiProperty({ type: Number }) expiredSubscriptions!: number;
  @ApiProperty({ type: Number }) students!: number;
  @ApiProperty({ type: Number }) teachers!: number;
  @ApiProperty({ type: Number }) exams!: number;
  @ApiProperty({ type: Number }) attempts!: number;
  @ApiProperty({ type: Number }) activations!: number;
  @ApiProperty({ type: [PlatformAnalyticsTrendDto] }) trends!: PlatformAnalyticsTrendDto[];
  @ApiProperty({ type: String }) computedAt!: string;
}
