import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  STUDENT_PROFILE_STATUSES,
  USER_STATUSES,
  type StudentProfileStatus,
  type UserStatus,
} from '@atlas/domain';

export class CreateStudentDto {
  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @MaxLength(64)
  firstName!: string;

  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @MaxLength(64)
  lastName!: string;

  /** Doubles as `SchoolMembership.loginIdentifier` (ADR-0005) — matches
   * that field's own doc comment example ("school-issued student ID like
   * 'ST001'"), so a Moderator enters one value, not two. */
  @ApiProperty({ type: String, maxLength: 32, example: 'ST001' })
  @IsString()
  @MaxLength(32)
  studentId!: string;

  @ApiPropertyOptional({ type: String, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  admissionNumber?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  admissionDate?: string;
}

export class UpdateStudentDto {
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

  @ApiPropertyOptional({ type: String, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  admissionNumber?: string;
}

export class StudentResponseDto {
  @ApiProperty({ type: String })
  membershipId!: string;

  @ApiProperty({ type: String })
  userId!: string;

  @ApiProperty({ type: String })
  studentProfileId!: string;

  @ApiProperty({ type: String })
  firstName!: string;

  @ApiProperty({ type: String })
  lastName!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String })
  studentId!: string;

  @ApiProperty({ type: String, nullable: true })
  admissionNumber!: string | null;

  @ApiProperty({ type: String })
  loginIdentifier!: string;

  /** Account status (07 §5.1's "account status" half — see C-14's split).
   * Deactivate/reactivate toggle this between ACTIVE and INACTIVE. */
  @ApiProperty({ type: String, enum: USER_STATUSES })
  userStatus!: UserStatus;

  /** Academic standing (07 §5.1's "authentication state" half's sibling —
   * see C-14's split). Never touched by deactivate/reactivate. */
  @ApiProperty({ type: String, enum: STUDENT_PROFILE_STATUSES })
  profileStatus!: StudentProfileStatus;
}

export class StudentListResponseDto {
  @ApiProperty({ type: StudentResponseDto, isArray: true })
  students!: StudentResponseDto[];
}
