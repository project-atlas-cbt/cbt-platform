import { ApiProperty } from '@nestjs/swagger';

/** F20 — one Software Admin as their peers see them (MFA peer reset). */
export class PlatformAdminSummaryDto {
  @ApiProperty({ type: String })
  userId!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: Boolean, description: 'A confirmed second factor is on file.' })
  mfaEnrolled!: boolean;

  @ApiProperty({ type: Boolean, description: 'This row is the caller.' })
  isSelf!: boolean;
}

export class PlatformAdminListResponseDto {
  @ApiProperty({ type: PlatformAdminSummaryDto, isArray: true })
  admins!: PlatformAdminSummaryDto[];
}
