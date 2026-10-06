import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { EXAM_NAVIGATION_POLICIES, type ExamNavigationPolicy } from '@atlas/domain';

/** Longest default an exam may start with: 24 hours. */
export const MAX_DEFAULT_EXAM_DURATION_SECONDS = 24 * 60 * 60;

/** Partial merge, like `PUT /v1/school/result-policy`: each field is
 * independently optional. `defaultExamDurationSeconds: null` clears the
 * default, so new exams start without a duration again. */
export class UpdateSchoolAssessmentRulesDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 60,
    maximum: MAX_DEFAULT_EXAM_DURATION_SECONDS,
    description: 'Default exam duration in whole seconds; null means no default.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(60)
  @Max(MAX_DEFAULT_EXAM_DURATION_SECONDS)
  defaultExamDurationSeconds?: number | null;

  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultAttemptLimit?: number;

  @ApiPropertyOptional({ type: String, enum: EXAM_NAVIGATION_POLICIES })
  @IsOptional()
  @IsIn(EXAM_NAVIGATION_POLICIES)
  defaultNavigationPolicy?: ExamNavigationPolicy;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  defaultRandomizeQuestions?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  defaultRandomizeOptions?: boolean;
}

export class SchoolAssessmentRulesResponseDto {
  @ApiProperty({ type: Number, nullable: true })
  defaultExamDurationSeconds!: number | null;

  @ApiProperty({ type: Number })
  defaultAttemptLimit!: number;

  @ApiProperty({ type: String, enum: EXAM_NAVIGATION_POLICIES })
  defaultNavigationPolicy!: ExamNavigationPolicy;

  @ApiProperty({ type: Boolean })
  defaultRandomizeQuestions!: boolean;

  @ApiProperty({ type: Boolean })
  defaultRandomizeOptions!: boolean;
}
