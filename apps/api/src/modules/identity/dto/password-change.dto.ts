import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class PasswordChangeDto {
  // Optional: a MUST_SET_PASSWORD/MUST_CHANGE_PASSWORD caller (a student on
  // their system-generated temporary password) has no "current password" of
  // their own choosing to confirm — the fact that AuthGuard already
  // resolved a live session is the authorization for the change. A
  // credentialState === 'OK' caller changing a password they set themselves
  // must supply it, checked in IdentityService.changePassword.
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  // NIST 800-63B minimum is 8; 10 with no composition rules, per A-02's
  // recommended interpretation (length over composition, no breach-list
  // network dependency — see the B1 plan's password-policy note).
  @ApiProperty({ type: String, minLength: 10 })
  @IsString()
  @MinLength(10)
  newPassword!: string;
}
