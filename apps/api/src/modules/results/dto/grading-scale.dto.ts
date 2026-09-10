import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CLASS_LEVELS, type ClassLevel } from '@atlas/domain';

export class GradingScaleBandDto {
  @ApiProperty({ type: String, maxLength: 16 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  label!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minPercentage!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maxPercentage!: number;

  /** B15's own addition (confirmed with the project owner): "pass rate" is a
   * required analytics metric with no threshold defined anywhere in the
   * specification, so the pass concept rides on the band. */
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  isPassing!: boolean;
}

/**
 * `PUT /v1/school/grading-scales` — ADR-0018: "Editing a scale creates a new
 * version; bands are never mutated in place." So this is a create-or-version
 * call, not an in-place update: submitting bands for a scale that already
 * exists appends a version and repoints `currentVersionId` at it.
 */
export class PutGradingScaleDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Omit to create a new scale; supply it to add a version to an existing one.',
  })
  @IsOptional()
  @IsString()
  scaleId?: string;

  @ApiProperty({ type: String, maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /** ADR-0018's optional level scoping — a JSS scale may differ from an SS
   * scale. `null`/absent means the school-wide default scale. */
  @ApiPropertyOptional({ enum: CLASS_LEVELS, nullable: true })
  @IsOptional()
  @IsIn(CLASS_LEVELS)
  level?: ClassLevel;

  @ApiProperty({ type: [GradingScaleBandDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GradingScaleBandDto)
  bands!: GradingScaleBandDto[];
}

export class GradingScaleVersionResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number }) versionNumber!: number;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: [GradingScaleBandDto] }) bands!: GradingScaleBandDto[];

  /** Whether any result was ever graded against this version. A version that
   * has graded results is frozen — the database enforces it (B15's
   * `grading_scale_bands_frozen_once_used` trigger), and the UI shows it so
   * versioning is visible rather than a surprise (ADR-0018's own
   * "Consequences — Harder" note). */
  @ApiProperty({ type: Boolean }) inUse!: boolean;
}

export class GradingScaleResponseDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ enum: CLASS_LEVELS, nullable: true }) level!: ClassLevel | null;
  @ApiProperty({ type: GradingScaleVersionResponseDto, nullable: true })
  currentVersion!: GradingScaleVersionResponseDto | null;
  @ApiProperty({ type: String }) updatedAt!: string;
}

export class GradingScaleListResponseDto {
  @ApiProperty({ type: [GradingScaleResponseDto] }) items!: GradingScaleResponseDto[];

  /** 05 §46's sample configuration, offered as a starting point so a school
   * with no scale yet has something to adopt and edit — never enforced. */
  @ApiProperty({ type: [GradingScaleBandDto] }) defaultTemplate!: GradingScaleBandDto[];
}

export class GradingScaleVersionListResponseDto {
  @ApiProperty({ type: [GradingScaleVersionResponseDto] })
  items!: GradingScaleVersionResponseDto[];
}
