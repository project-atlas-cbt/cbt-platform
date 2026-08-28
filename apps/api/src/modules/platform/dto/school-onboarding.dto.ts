import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * F4's server-persisted wizard-progress state (03 §3, 05 §5.1-5.2). The
 * roadmap's own resumability requirement — "wizard progress persisted
 * server-side, not only in the browser" — has no backing anywhere else in
 * the schema; `completedAt`/`currentStep`/`skippedSteps` are this phase's
 * gap-closure. `completedAt` is the only field ever consulted for a
 * business rule (re-entry-blocked, the two hard-blocker completion check);
 * `currentStep`/`skippedSteps` are ephemeral UI-progress only.
 */
export class OnboardingStatusResponseDto {
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  completedAt!: string | null;

  @ApiProperty({ type: Number, minimum: 1, maximum: 10 })
  currentStep!: number;

  @ApiProperty({ type: [Number] })
  skippedSteps!: number[];
}

export class UpdateOnboardingProgressDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  currentStep!: number;

  @ApiProperty({ type: [Number], required: false })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  skippedSteps?: number[];
}
