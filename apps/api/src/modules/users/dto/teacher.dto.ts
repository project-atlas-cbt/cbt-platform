import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EMPLOYMENT_STATUSES,
  USER_STATUSES,
  type EmploymentStatus,
  type UserStatus,
} from '@atlas/domain';

export class CreateTeacherDto {
  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @MaxLength(64)
  firstName!: string;

  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @MaxLength(64)
  lastName!: string;

  @ApiProperty({ type: String, maxLength: 320 })
  @IsString()
  @MaxLength(320)
  email!: string;

  /** Doubles as `SchoolMembership.loginIdentifier` — same reasoning as
   * CreateStudentDto.studentId. */
  @ApiProperty({ type: String, maxLength: 32, example: 'STF001' })
  @IsString()
  @MaxLength(32)
  staffId!: string;
}

export class UpdateTeacherDto {
  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  firstName?: string;

  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastName?: string;

  @ApiPropertyOptional({ type: String, maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;
}

export class TeacherResponseDto {
  @ApiProperty({ type: String })
  membershipId!: string;

  @ApiProperty({ type: String })
  userId!: string;

  @ApiProperty({ type: String })
  teacherProfileId!: string;

  @ApiProperty({ type: String })
  firstName!: string;

  @ApiProperty({ type: String })
  lastName!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String })
  staffId!: string;

  @ApiProperty({ type: String })
  loginIdentifier!: string;

  @ApiProperty({ type: String, enum: USER_STATUSES })
  userStatus!: UserStatus;

  @ApiProperty({ type: String, enum: EMPLOYMENT_STATUSES })
  employmentStatus!: EmploymentStatus;

  /** True when the membership holds an active HOD RoleAssignment —
   * lets the People workspace show HOD standing on the teacher row itself
   * without a second call. */
  @ApiProperty({ type: Boolean })
  isHod!: boolean;
}

export class TeacherListResponseDto {
  @ApiProperty({ type: TeacherResponseDto, isArray: true })
  teachers!: TeacherResponseDto[];
}
