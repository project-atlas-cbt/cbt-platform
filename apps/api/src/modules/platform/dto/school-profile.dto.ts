import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '@atlas/domain';

/** `03 §4` Step 1 — School Profile onboarding step. F5 gap-closure: `name`
 * added — `02`'s matrix grants School Admin "Full" edit of "school
 * name/details," but this DTO never actually carried it. `subdomain`
 * deliberately stays out of scope here: it's ADR-0005's frozen
 * tenant-resolution key, not an ordinary profile field. */
export class UpdateSchoolProfileDto {
  @ApiProperty({ type: String, required: false, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

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

  @ApiProperty({
    type: String,
    enum: SUBSCRIPTION_STATUSES,
    description:
      "F5 gap-closure: gained an accurate enum: (matching SchoolSubscriptionSummaryDto's own precedent) — was plain type: String before, a real typing gap tsc caught building the first frontend consumer.",
  })
  status!: SubscriptionStatus;

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
