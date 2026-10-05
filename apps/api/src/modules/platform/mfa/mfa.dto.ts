import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, Length, Matches, MaxLength, MinLength } from 'class-validator';

/** `POST /v1/platform/auth/login` — B20: `mfa_required` (with a
 * `challengeToken`, and no session cookie yet) when the admin has a second
 * factor enrolled; `ok` with the session cookie otherwise. */
export class PlatformLoginResponseDto {
  @ApiProperty({ type: String, enum: ['ok', 'mfa_required'] })
  status!: 'ok' | 'mfa_required';

  @ApiPropertyOptional({
    type: String,
    description: 'Present only when status is mfa_required. Single-use, 5 minutes.',
  })
  challengeToken?: string;
}

export class MfaVerifyDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  challengeToken!: string;

  @ApiProperty({ type: String, description: 'Six-digit TOTP code.', example: '123456' })
  @Matches(/^\d{6}$/u)
  otp!: string;
}

export class MfaRecoveryDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  challengeToken!: string;

  @ApiProperty({ type: String, description: 'One unused recovery code.' })
  @IsString()
  @Length(16, 32)
  recoveryCode!: string;
}

export class MfaCodeDto {
  @ApiProperty({ type: String, example: '123456' })
  @Matches(/^\d{6}$/u)
  otp!: string;
}

export class MfaStatusResponseDto {
  @ApiProperty({ type: Boolean })
  enrolled!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Whether the platform enforces a second factor for Software Admin.',
  })
  required!: boolean;

  @ApiProperty({ type: Number })
  recoveryCodesRemaining!: number;
}

export class MfaEnrolmentStartResponseDto {
  @ApiProperty({ type: String, description: 'Base32 secret, for manual entry.' })
  secret!: string;

  @ApiProperty({ type: String, description: 'otpauth:// URI, for a QR code.' })
  otpauthUri!: string;
}

export class MfaEnrolmentConfirmResponseDto {
  @ApiProperty({
    type: [String],
    description: 'Shown exactly once — never retrievable again.',
  })
  recoveryCodes!: string[];
}

export class MfaResetDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class PlatformSessionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  lastSeenAt!: string;

  @ApiProperty({ type: String, nullable: true })
  userAgent!: string | null;

  @ApiProperty({ type: String, nullable: true })
  ipAddress!: string | null;

  @ApiProperty({ type: Boolean, description: 'The session making this request.' })
  isCurrent!: boolean;
}

export class PlatformSessionListResponseDto {
  @ApiProperty({ type: [PlatformSessionDto] })
  sessions!: PlatformSessionDto[];
}

export class SignOutOtherSessionsResponseDto {
  @ApiProperty({ type: Number, description: 'How many other sessions were ended.' })
  signedOut!: number;
}
