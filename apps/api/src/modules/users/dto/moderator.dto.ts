import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { USER_STATUSES, type UserStatus } from '@atlas/domain';

export class CreateModeratorDto {
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

  /** No profile table backs Moderator (05 §14: operational, not academic —
   * no staffId/studentId to derive one from), so this is an explicit,
   * required field rather than doubled from another column. */
  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @MaxLength(64)
  loginIdentifier!: string;
}

export class UpdateModeratorDto {
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

export class ModeratorResponseDto {
  @ApiProperty({ type: String })
  membershipId!: string;

  @ApiProperty({ type: String })
  userId!: string;

  @ApiProperty({ type: String })
  firstName!: string;

  @ApiProperty({ type: String })
  lastName!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String })
  loginIdentifier!: string;

  @ApiProperty({ type: String, enum: USER_STATUSES })
  userStatus!: UserStatus;
}

export class ModeratorListResponseDto {
  @ApiProperty({ type: ModeratorResponseDto, isArray: true })
  moderators!: ModeratorResponseDto[];
}
