import { ApiProperty } from '@nestjs/swagger';
import { ROLES, type Role } from '@atlas/domain';

export class PlatformMeUserDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  firstName!: string;

  @ApiProperty({ type: String })
  lastName!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String, description: 'UserStatus (06 §7).' })
  status!: string;
}

/** Mirrors PlatformAuthService.me()'s return shape — no `membership`/
 * `effectiveSchoolId` fields (identity's MeResponseDto has both); a
 * platform account has neither. */
export class PlatformMeResponseDto {
  @ApiProperty({ type: PlatformMeUserDto })
  user!: PlatformMeUserDto;

  @ApiProperty({
    type: String,
    isArray: true,
    enum: ROLES,
    description: 'Active PlatformRoleAssignment.role values (02).',
  })
  roles!: Role[];

  @ApiProperty({
    type: Boolean,
    description:
      'True while the account is still on the temporary password it was emailed; every route but the password change, sign-out, this one and two-step setup answers PASSWORD_CHANGE_REQUIRED until it is changed.',
  })
  mustChangePassword!: boolean;
}
