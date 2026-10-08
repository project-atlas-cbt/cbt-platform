import { ApiProperty } from '@nestjs/swagger';
import { ROLES, type Role } from '@atlas/domain';

export class MeUserDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  firstName!: string;

  @ApiProperty({ type: String })
  lastName!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String, description: 'UserStatus (06 §7) — e.g. ACTIVE, SUSPENDED.' })
  status!: string;
}

export class MeMembershipDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  loginIdentifier!: string;

  @ApiProperty({ type: String, description: 'SchoolMembership.status (07 §5.2).' })
  status!: string;
}

/**
 * Mirrors IdentityService.me()'s return shape exactly — roles are the
 * caller's *active* `RoleAssignment.role` values, read live from the
 * database on every request, never derived from a decoded token (09 §25).
 */
export class MeResponseDto {
  @ApiProperty({ type: MeUserDto })
  user!: MeUserDto;

  @ApiProperty({ type: MeMembershipDto })
  membership!: MeMembershipDto;

  @ApiProperty({
    type: String,
    isArray: true,
    enum: ROLES,
    description: 'Active RoleAssignment.role values for this membership (02).',
  })
  roles!: Role[];

  @ApiProperty({ type: String })
  effectiveSchoolId!: string;

  @ApiProperty({
    type: Boolean,
    description:
      'Signed in with Login ID + name (passwordless student sign-in): no password change is asked for or allowed.',
  })
  passwordless!: boolean;
}
