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

/**
 * F4 gap-closure: redeem previously returned only `{status: 'ok'}`, leaving
 * the School Admin's `login_identifier` — set at school-creation time
 * (`SchoolsAdminService`, from `CreateSchoolDto.adminLoginIdentifier`) —
 * never surfaced anywhere (not this response, not the activation email
 * template), so F4's redeem-then-log-in handoff had nothing to log in
 * with. Discloses a username (not a secret) only to a caller who already
 * possesses a valid, unexpired, unredeemed key for that school — no new
 * disclosure risk beyond what key possession already implies, matching
 * `ActivationService`'s own existing reasoning for renewal's
 * no-extra-session-check design.
 */
export class ActivationRedeemResponseDto {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({ type: String })
  loginIdentifier!: string;
}
