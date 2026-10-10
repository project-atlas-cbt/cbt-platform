import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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
    description:
      'ADR-0038: the stream students joining this class take unless set otherwise. Null for a mixed arm and for JSS.',
  })
  @IsOptional()
  @IsUUID()
  defaultStreamId?: string | null;

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
  defaultStreamId?: string | null;

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

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'ADR-0038: with a new defaultStreamId, also put the class’s current students who are in ' +
      'no stream into it (registering its stream subjects). Students already in a stream keep it.',
  })
  @IsOptional()
  @IsBoolean()
  placeStudentsWithoutStream?: boolean;
}

export class ClassGroupResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  academicSessionId!: string;

  @ApiProperty({ type: String, nullable: true })
  defaultStreamId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  defaultStreamName!: string | null;

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
