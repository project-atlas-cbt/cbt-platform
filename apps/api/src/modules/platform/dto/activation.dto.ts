import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ActivationVerifyDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  key!: string;
}

export class ActivationRedeemDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  key!: string;

  @ApiProperty({
    type: String,
    required: false,
    minLength: 10,
    description: 'Required for an INITIAL_ACTIVATION-purpose key; the admin has no password yet.',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  newPassword?: string;
}

export class ActivationVerifyResponseDto {
  @ApiProperty({ type: String })
  schoolName!: string;

  @ApiProperty({ type: String, enum: ['INITIAL_ACTIVATION', 'RENEWAL'] })
  purpose!: 'INITIAL_ACTIVATION' | 'RENEWAL';

  @ApiProperty({ type: Boolean, description: 'Whether redeem must include newPassword.' })
  requiresPassword!: boolean;
}
