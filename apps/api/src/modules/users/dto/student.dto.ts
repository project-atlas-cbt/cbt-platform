import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  STUDENT_PROFILE_STATUSES,
  USER_STATUSES,
  type StudentProfileStatus,
  type UserStatus,
} from '@atlas/domain';
import { ListPeopleQueryDto } from './list-query.dto.js';

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

  /** F7 gap-closure: the student's current (ACTIVE) enrollment, if any —
   * `05 §9.1`'s directory column list names Class/Department/Session, which
   * `StudentResponseDto` had no way to show before this. All nullable: a
   * newly-created student may have no enrollment yet. */
  @ApiProperty({ type: String, nullable: true })
  currentClassId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  currentClassName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  currentAcademicSessionId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  departmentId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  departmentName!: string | null;
}

/**
 * F14 gap-closure — `GET /students/me` (04 §62's Profile screen). A
 * separate, deliberately minimal DTO from `StudentResponseDto` (the staff
 * directory shape), mirroring `student-result.dto.ts`'s own "separate,
 * audience-scoped DTO family" precedent — no account/profile status enums,
 * no ids beyond what the screen needs.
 */
export class StudentOwnProfileResponseDto {
  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String })
  studentId!: string;

  @ApiProperty({ type: String, nullable: true })
  currentClassName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  departmentName!: string | null;
}

export class StudentListResponseDto {
  @ApiProperty({ type: StudentResponseDto, isArray: true })
  students!: StudentResponseDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
}

export class LockedOutStudentsResponseDto {
  @ApiProperty({ type: StudentResponseDto, isArray: true })
  students!: StudentResponseDto[];
}

const STUDENT_LIST_SORT_FIELDS = ['studentId', 'lastName'] as const;
type StudentListSortField = (typeof STUDENT_LIST_SORT_FIELDS)[number];

/** F7 gap-closure — `admissionNumber` is deliberately excluded from
 * `sortBy`: it's nullable and not a field a directory search meaningfully
 * sorts by, mirroring `ListSchoolsQueryDto`'s own precedent of documenting
 * why a field is excluded rather than silently omitting it. */
export class ListStudentsQueryDto extends ListPeopleQueryDto {
  @ApiPropertyOptional({ type: String, enum: STUDENT_LIST_SORT_FIELDS })
  @IsOptional()
  @IsIn(STUDENT_LIST_SORT_FIELDS)
  sortBy?: StudentListSortField;

  /** Filters the directory to students currently (ACTIVE) enrolled in this
   * class — decision A's own filtering requirement. */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsUUID()
  classId?: string;
}
