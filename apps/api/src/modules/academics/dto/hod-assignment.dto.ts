import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { HOD_ASSIGNMENT_STATUSES, type HODAssignmentStatus } from '@atlas/domain';

/** `07 §6.9` / audit finding D-11: references a SchoolMembership, not a bare
 * user id — see HodAssignmentService.create for the active-HOD-role
 * invariant this DTO's shape alone cannot express. */
export class CreateHodAssignmentDto {
  @ApiProperty({ type: String })
  @IsUUID()
  membershipId!: string;

  @ApiProperty({ type: String })
  @IsUUID()
  departmentId!: string;

  @ApiProperty({ type: String })
  @IsUUID()
  academicSessionId!: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class HodAssignmentResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  membershipId!: string;

  @ApiProperty({ type: String })
  departmentId!: string;

  @ApiProperty({ type: String })
  academicSessionId!: string;

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  endDate!: string | null;

  @ApiProperty({ type: String, enum: HOD_ASSIGNMENT_STATUSES })
  status!: HODAssignmentStatus;
}

export class HodAssignmentListResponseDto {
  @ApiProperty({ type: HodAssignmentResponseDto, isArray: true })
  assignments!: HodAssignmentResponseDto[];
}
