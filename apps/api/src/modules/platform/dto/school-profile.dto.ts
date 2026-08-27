import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** `03 §4` Step 1 — School Profile onboarding step. */
export class UpdateSchoolProfileDto {
  @ApiProperty({ type: String, required: false, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  shortName?: string;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiProperty({ type: String, required: false, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  address?: string;
}

export class SchoolProfileResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  subdomain!: string;

  @ApiProperty({ type: String })
  timezone!: string;

  @ApiProperty({ type: String, nullable: true })
  shortName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactPhone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;
}

export class SchoolSubscriptionStatusResponseDto {
  @ApiProperty({ type: String })
  plan!: string;

  @ApiProperty({ type: String })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  startAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({
    type: Boolean,
    description: "Whether the school is currently within ADR-0015's post-expiry grace window.",
  })
  inGracePeriod!: boolean;
}
