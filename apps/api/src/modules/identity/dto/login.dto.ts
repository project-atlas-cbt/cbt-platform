import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    type: String,
    description: 'Login identifier — username or school-issued student ID.',
  })
  // Trimmed, not case-normalised, here — IdentityService.evaluateLogin does
  // the case-insensitive comparison against the stored value (identifiers
  // aren't stored lowercased, so trimming is the only transform safe to do
  // before validation runs). A leading/trailing space is an easy thing to
  // pick up copy-pasting an identifier off a printed/CSV credential sheet,
  // and MinLength(1) would otherwise still accept a whitespace-only value.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  identifier!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  password!: string;
}
