import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class PlatformLoginDto {
  @ApiProperty({ type: String, description: "Software Admin's account email." })
  // Trimmed before @IsEmail() runs — a leading/trailing space from a
  // password manager or manual entry otherwise fails email-format
  // validation outright (a 400, not the generic login-failure response),
  // which is exactly the kind of failure PlatformAuthService.evaluateLogin's
  // own enumeration-resistant collapse was never meant to hide behind an
  // identical-looking "wrong password" message. PlatformAuthService does the
  // case-insensitive comparison against the stored email.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  email!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  password!: string;
}
