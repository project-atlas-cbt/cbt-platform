import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  CLASS_GROUP_STATUSES,
  CLASS_LEVELS,
  type ClassGroupStatus,
  type ClassLevel,
} from '@atlas/domain';

export class CreateClassGroupDto {
  @ApiProperty({ type: String })
  @IsUUID()
  academicSessionId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Null for classes with no department (e.g. JSS levels before streaming).',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiProperty({ type: String, maxLength: 32, example: 'SS2A' })
  @IsString()
  @MaxLength(32)
  name!: string;

  @ApiProperty({ type: String, enum: CLASS_LEVELS })
  @IsIn(CLASS_LEVELS)
  level!: ClassLevel;

  @ApiProperty({ type: String, maxLength: 16, example: 'A' })
  @IsString()
  @MaxLength(16)
  arm!: string;
}

export class UpdateClassGroupDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  name?: string;

  @ApiPropertyOptional({ type: String, enum: CLASS_LEVELS })
  @IsOptional()
  @IsIn(CLASS_LEVELS)
  level?: ClassLevel;

  @ApiPropertyOptional({ type: String, maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  arm?: string;
}

export class ClassGroupResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  academicSessionId!: string;

  @ApiProperty({ type: String, nullable: true })
  departmentId!: string | null;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, enum: CLASS_LEVELS })
  level!: ClassLevel;

  @ApiProperty({ type: String })
  arm!: string;

  @ApiProperty({ type: String, enum: CLASS_GROUP_STATUSES })
  status!: ClassGroupStatus;
}

export class ClassGroupListResponseDto {
  @ApiProperty({ type: ClassGroupResponseDto, isArray: true })
  classes!: ClassGroupResponseDto[];
}
