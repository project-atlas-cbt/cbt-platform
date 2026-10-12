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
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ROLLOVER_OUTCOMES, ROLLOVER_PLAN_STATUSES } from '@atlas/domain';

export class CreateRolloverPlanDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() targetAcademicSessionId!: string;
}

export class UpdateRolloverDecisionItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() decisionId!: string;
  @ApiProperty({ enum: ROLLOVER_OUTCOMES })
  @IsIn(ROLLOVER_OUTCOMES)
  outcome!: (typeof ROLLOVER_OUTCOMES)[number];
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  targetDraftClassId?: string | null;
  @ApiProperty({ maxLength: 500 })
  @IsString()
  @Matches(/\S/, { message: 'reason must not be blank.' })
  @MaxLength(500)
  reason!: string;
}
export class UpdateRolloverDecisionsDto {
  @ApiProperty({ type: UpdateRolloverDecisionItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => UpdateRolloverDecisionItemDto)
  decisions!: UpdateRolloverDecisionItemDto[];
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}

export class UpdateRolloverStructureItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() draftId!: string;
  @ApiProperty() @IsBoolean() included!: boolean;
}
export class UpdateRolloverStaffDraftDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() draftId!: string;
  @ApiProperty() @IsBoolean() confirmed!: boolean;
}
export class UpdateRolloverStructureDto {
  @ApiPropertyOptional({ type: UpdateRolloverStructureItemDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRolloverStructureItemDto)
  classes?: UpdateRolloverStructureItemDto[];
  @ApiPropertyOptional({ type: UpdateRolloverStructureItemDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRolloverStructureItemDto)
  offerings?: UpdateRolloverStructureItemDto[];
  @ApiPropertyOptional({ type: UpdateRolloverStaffDraftDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRolloverStaffDraftDto)
  staffAssignments?: UpdateRolloverStaffDraftDto[];
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}

export class RolloverQueryDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
  @ApiPropertyOptional({ enum: ROLLOVER_OUTCOMES })
  @IsOptional()
  @IsIn(ROLLOVER_OUTCOMES)
  outcome?: (typeof ROLLOVER_OUTCOMES)[number];
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() sourceClassId?: string;
  /** ADR-0038: students whose source class has this default stream. */
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() streamId?: string;
  @ApiPropertyOptional({ enum: ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'] })
  @IsOptional()
  @IsIn(['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'])
  sourceLevel?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean() overriddenOnly?: boolean;
  /** Student search: every word must match the student ID or a name part. */
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) q?: string;
}

export class CommitRolloverDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}

export class RolloverPlanResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) sourceAcademicSessionId!: string;
  @ApiProperty({ format: 'uuid' }) targetAcademicSessionId!: string;
  @ApiProperty({ enum: ROLLOVER_PLAN_STATUSES }) status!: (typeof ROLLOVER_PLAN_STATUSES)[number];
  @ApiProperty({ minimum: 1 }) version!: number;
  @ApiProperty() readiness!: Record<string, unknown>;
  @ApiProperty() decisions!: unknown[];
  @ApiProperty() structure!: Record<string, unknown>;
  @ApiProperty() pagination!: { page: number; pageSize: number; total: number };
}
