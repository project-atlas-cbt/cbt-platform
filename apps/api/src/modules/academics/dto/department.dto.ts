import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { DEPARTMENT_STATUSES, type DepartmentStatus } from '@atlas/domain';

export class CreateDepartmentDto {
  @ApiProperty({ type: String, maxLength: 128, example: 'Science' })
  @IsString()
  @MaxLength(128)
  name!: string;

  @ApiProperty({ type: String, maxLength: 16, example: 'SCI' })
  @IsString()
  @MaxLength(16)
  code!: string;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional({ type: String, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ type: String, maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;
}

export class DepartmentResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String, enum: DEPARTMENT_STATUSES })
  status!: DepartmentStatus;

  /** P1-12: set on the list only — whether the caller holds an active HOD
   * assignment for this department, so an HOD's screens open their own
   * department rather than the first one alphabetically. */
  @ApiPropertyOptional({ type: Boolean })
  headedByMe?: boolean;
}

export class DepartmentListResponseDto {
  @ApiProperty({ type: DepartmentResponseDto, isArray: true })
  departments!: DepartmentResponseDto[];
}
