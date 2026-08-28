import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  RESULT_DETAIL_VISIBILITIES,
  RESULT_POLICIES,
  type ResultDetailVisibility,
  type ResultPolicy,
} from '@atlas/domain';

export class UpdateSchoolResultPolicyDto {
  @ApiProperty({
    type: String,
    enum: RESULT_POLICIES,
    required: false,
    description: 'Who releases a result by default: TEACHER / SCHOOL_ADMIN / AUTOMATIC (05 §47).',
  })
  @IsOptional()
  @IsIn(RESULT_POLICIES)
  resultPolicy?: ResultPolicy;

  @ApiProperty({
    type: String,
    enum: RESULT_DETAIL_VISIBILITIES,
    required: false,
    description: 'What a student sees once a result is released (ADR-0010’s second axis).',
  })
  @IsOptional()
  @IsIn(RESULT_DETAIL_VISIBILITIES)
  resultDetailVisibility?: ResultDetailVisibility;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'Whether a teacher may override the seeded resultPolicy on their own exams (B15 enforces this; F5 only stores the flag).',
  })
  @IsOptional()
  @IsBoolean()
  resultPolicyLocked?: boolean;
}

export class SchoolResultPolicyResponseDto {
  @ApiProperty({ type: String, enum: RESULT_POLICIES })
  resultPolicy!: ResultPolicy;

  @ApiProperty({ type: String, enum: RESULT_DETAIL_VISIBILITIES })
  resultDetailVisibility!: ResultDetailVisibility;

  @ApiProperty({ type: Boolean })
  resultPolicyLocked!: boolean;
}
