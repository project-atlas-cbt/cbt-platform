import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { STREAM_STATUSES, type StreamStatus } from '@atlas/domain';

/** ADR-0038 — a student stream (Science, Humanities, Business). */
export class CreateStreamDto {
  @ApiProperty({ type: String, maxLength: 64, example: 'Science' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @ApiProperty({ type: String, maxLength: 16, example: 'SCI' })
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  code!: string;
}

export class UpdateStreamDto {
  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ type: String, maxLength: 16 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  code?: string;

  /** INACTIVE retires a stream: it stays on the classes and enrollments
   * that name it, but can't be chosen again. */
  @ApiPropertyOptional({ type: String, enum: STREAM_STATUSES })
  @IsOptional()
  @IsIn(STREAM_STATUSES)
  status?: StreamStatus;
}

export class StreamResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String, enum: STREAM_STATUSES })
  status!: StreamStatus;

  /** Classes in the current session with this as their default stream. */
  @ApiProperty({ type: Number })
  classCount!: number;

  /** ACTIVE enrollments in this stream. */
  @ApiProperty({ type: Number })
  studentCount!: number;
}

export class StreamListResponseDto {
  @ApiProperty({ type: StreamResponseDto, isArray: true })
  streams!: StreamResponseDto[];
}
