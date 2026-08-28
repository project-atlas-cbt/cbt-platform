import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ACADEMIC_SESSION_STATUSES, type AcademicSessionStatus } from '@atlas/domain';

export class CreateAcademicSessionDto {
  @ApiProperty({ type: String, maxLength: 32, example: '2026/2027' })
  @IsString()
  @MaxLength(32)
  name!: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsDateString()
  endDate!: string;
}

/** FR `05 §7.1`: "Edit upcoming session" — SessionService restricts which
 * statuses may still be edited; this DTO itself only shapes the fields. */
export class UpdateAcademicSessionDto {
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

export class AcademicSessionResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;

  @ApiProperty({ type: String, format: 'date' })
  endDate!: string;

  @ApiProperty({ type: String, enum: ACADEMIC_SESSION_STATUSES })
  status!: AcademicSessionStatus;
}

export class AcademicSessionListResponseDto {
  @ApiProperty({ type: AcademicSessionResponseDto, isArray: true })
  sessions!: AcademicSessionResponseDto[];
}
