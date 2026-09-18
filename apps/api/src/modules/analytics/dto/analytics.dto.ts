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
  @ApiProperty({ nullable: true }) averagePercentage!: number | null;
  @ApiProperty({ nullable: true }) highestPercentage!: number | null;
  @ApiProperty({ nullable: true }) lowestPercentage!: number | null;
  @ApiProperty({ nullable: true }) passRate!: number | null;
  @ApiProperty() resultCount!: number;
}

export class ParticipationMetricDto {
  @ApiProperty() expectedStudentCount!: number;
  @ApiProperty() attendedCount!: number;
  @ApiProperty() absentCount!: number;
  @ApiProperty() pendingCount!: number;
  @ApiProperty() completionRate!: number | null;
}

export class PercentageDistributionBucketDto {
  @ApiProperty() lowerBound!: number;
  @ApiProperty() upperBound!: number;
  @ApiProperty() count!: number;
  @ApiProperty({ nullable: true }) percentage!: number | null;
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
  @ApiProperty() examQuestionId!: string;
  @ApiProperty() sequence!: number;
  @ApiProperty() questionId!: string;
  @ApiProperty() questionType!: string;
  @ApiProperty() subjectId!: string;
  @ApiProperty({ nullable: true }) topicName!: string | null;
  @ApiProperty() exposureCount!: number;
  @ApiProperty() correctCount!: number;
  @ApiProperty() incorrectCount!: number;
  @ApiProperty() unansweredCount!: number;
  @ApiProperty() correctRate!: number;
  @ApiProperty() incorrectRate!: number;
  @ApiProperty() unansweredRate!: number;
  @ApiProperty() voidedForScoring!: boolean;
}

export class QuestionAnalyticsResponseDto {
  @ApiProperty() examId!: string;
  @ApiProperty({ type: [QuestionPerformanceDto] }) items!: QuestionPerformanceDto[];
}

export class ComparisonMetricDto extends PercentageMetricDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class AnalyticsTrendDto extends PercentageMetricDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: ParticipationMetricDto }) participation!: ParticipationMetricDto;
  @ApiProperty() examCount!: number;
  @ApiProperty() attemptCount!: number;
}

export class ClassAnalyticsResponseDto extends PercentageMetricDto {
  @ApiProperty() classId!: string;
  @ApiProperty({ type: ParticipationMetricDto }) participation!: ParticipationMetricDto;
  @ApiProperty({ type: [ComparisonMetricDto] }) subjects!: ComparisonMetricDto[];
  @ApiProperty({ type: [ComparisonMetricDto] }) exams!: ComparisonMetricDto[];
}

export class DepartmentAnalyticsResponseDto extends PercentageMetricDto {
  @ApiProperty() departmentId!: string;
  @ApiProperty({ type: [ComparisonMetricDto] }) subjects!: ComparisonMetricDto[];
  @ApiProperty({ type: [ComparisonMetricDto] }) classes!: ComparisonMetricDto[];
  @ApiProperty({ type: [ComparisonMetricDto] }) exams!: ComparisonMetricDto[];
  @ApiProperty({ type: [AnalyticsTrendDto] }) termTrends!: AnalyticsTrendDto[];
}

export class SchoolAnalyticsResponseDto extends PercentageMetricDto {
  @ApiProperty({ type: ParticipationMetricDto }) participation!: ParticipationMetricDto;
  @ApiProperty() examCount!: number;
  @ApiProperty() attemptCount!: number;
  @ApiProperty({ type: [ComparisonMetricDto] }) departments!: ComparisonMetricDto[];
  @ApiProperty({ type: [AnalyticsTrendDto] }) sessionTrends!: AnalyticsTrendDto[];
}

export class StudentAnalyticsHistoryItemDto {
  @ApiProperty() examId!: string;
  @ApiProperty() examTitle!: string;
  @ApiProperty() subjectName!: string;
  @ApiProperty() percentage!: number;
  @ApiProperty({ nullable: true }) grade!: string | null;
  @ApiProperty({ nullable: true }) finalizedAt!: string | null;
}

export class StudentAnalyticsResponseDto extends PercentageMetricDto {
  @ApiProperty() studentProfileId!: string;
  @ApiProperty({ type: [StudentAnalyticsHistoryItemDto] })
  history!: StudentAnalyticsHistoryItemDto[];
}

export class PlatformAnalyticsTrendDto {
  @ApiProperty() month!: string;
  @ApiProperty() schoolsCreated!: number;
  @ApiProperty() examsCreated!: number;
  @ApiProperty() attemptsStarted!: number;
}

export class PlatformAnalyticsResponseDto {
  @ApiProperty() totalSchools!: number;
  @ApiProperty() activeSchools!: number;
  @ApiProperty() provisionalSchools!: number;
  @ApiProperty() suspendedSchools!: number;
  @ApiProperty() expiredSchools!: number;
  @ApiProperty() deactivatedSchools!: number;
  @ApiProperty() pendingSubscriptions!: number;
  @ApiProperty() activeSubscriptions!: number;
  @ApiProperty() expiringSubscriptions!: number;
  @ApiProperty() expiredSubscriptions!: number;
  @ApiProperty() students!: number;
  @ApiProperty() teachers!: number;
  @ApiProperty() exams!: number;
  @ApiProperty() attempts!: number;
  @ApiProperty() activations!: number;
  @ApiProperty({ type: [PlatformAnalyticsTrendDto] }) trends!: PlatformAnalyticsTrendDto[];
  @ApiProperty() computedAt!: string;
}
