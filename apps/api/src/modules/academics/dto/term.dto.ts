import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { ACADEMIC_TERM_STATUSES, type AcademicTermStatus } from '@atlas/domain';

export class CreateAcademicTermDto {
  @ApiProperty({ type: String, maxLength: 32, example: 'First Term' })
  @IsString()
  @MaxLength(32)
  name!: string;

  @ApiProperty({ type: Number, minimum: 1, description: 'Order within the session (1, 2, 3).' })
  @IsInt()
  @Min(1)
  sequence!: number;

  @ApiProperty({ type: String, format: 'date' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsDateString()
  endDate!: string;
}

export class UpdateAcademicTermDto {
  @ApiPropertyOptional({ type: String, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  name?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class AcademicTermResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  academicSessionId!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Number })
  sequence!: number;

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;

  @ApiProperty({ type: String, format: 'date' })
  endDate!: string;

  @ApiProperty({ type: String, enum: ACADEMIC_TERM_STATUSES })
  status!: AcademicTermStatus;
}

export class AcademicTermListResponseDto {
  @ApiProperty({ type: AcademicTermResponseDto, isArray: true })
  terms!: AcademicTermResponseDto[];
}
