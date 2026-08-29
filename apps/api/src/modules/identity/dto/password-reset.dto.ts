import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class PasswordResetRequestDto {
  @ApiProperty({
    type: String,
    description:
      'The staff login identifier to send a reset link for. Students have no email — see A-02.',
  })
  // See LoginDto.identifier's own comment — same trim, same reasoning:
  // IdentityService.requestPasswordReset does the case-insensitive lookup.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  identifier!: string;
}

export class PasswordResetConfirmDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty({ type: String, minLength: 10 })
  @IsString()
  @MinLength(10)
  newPassword!: string;
}
