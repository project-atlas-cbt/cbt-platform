import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** ADR-0038 — a school-wide "pick between min and max of these subjects"
 * rule. Subjects join a group through `Subject.choiceGroupId`. */
export class CreateSubjectChoiceGroupDto {
  @ApiProperty({ type: String, maxLength: 64, example: 'Religion' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 20, example: 1 })
  @IsInt()
  @Min(0)
  @Max(20)
  minChoices!: number;

  @ApiProperty({ type: Number, minimum: 1, maximum: 20, example: 1 })
  @IsInt()
  @Min(1)
  @Max(20)
  maxChoices!: number;
}

export class UpdateSubjectChoiceGroupDto {
  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  minChoices?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxChoices?: number;
}

export class SubjectChoiceGroupResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Number })
  minChoices!: number;

  @ApiProperty({ type: Number })
  maxChoices!: number;

  @ApiProperty({ type: String, isArray: true })
  subjectIds!: string[];
}

export class SubjectChoiceGroupListResponseDto {
  @ApiProperty({ type: SubjectChoiceGroupResponseDto, isArray: true })
  choiceGroups!: SubjectChoiceGroupResponseDto[];
}
