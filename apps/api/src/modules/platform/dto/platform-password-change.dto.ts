import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Unlike identity's PasswordChangeDto, the current password is always
 * required — the temporary one included (PlatformAuthService.changePassword).
 */
export class PlatformPasswordChangeDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  // Same policy as school accounts (A-02: length over composition).
  @ApiProperty({ type: String, minLength: 10, maxLength: 256 })
  @IsString()
  @MinLength(10)
  @MaxLength(256)
  newPassword!: string;
}
