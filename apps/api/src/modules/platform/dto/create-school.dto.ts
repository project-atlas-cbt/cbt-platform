import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** ADR-0038 amendment: how the school's academic structure starts. */
export const SCHOOL_STARTING_STRUCTURES = ['STANDARD', 'EMPTY'] as const;
export type SchoolStartingStructure = (typeof SCHOOL_STARTING_STRUCTURES)[number];

/** `05 §3.2`'s required-field list exactly: "School name, Admin name, Admin
 * email/identifier, Subscription, Initial subscription period." No
 * short_name/contact/address/branding here — those are set later via
 * `PATCH /v1/school/profile` (03 §4 Step 1) once the school is activated. */
export class CreateSchoolDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({
    type: String,
    description:
      "The school's web address label, `<subdomain>.<root>` (ADR-0005 amendment): 3 to 20 lowercase letters, digits and single hyphens, not reserved, not used by any school. Omitted: the best free suggestion from the name.",
    example: 'ola',
  })
  @IsOptional()
  @IsString()
  @MaxLength(63)
  subdomain?: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  adminFirstName!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  adminLastName!: string;

  @ApiProperty({
    type: String,
    description: "The admin's email — where the activation key is sent.",
  })
  @IsEmail()
  adminEmail!: string;

  @ApiProperty({
    type: String,
    description:
      'The login identifier this admin will use to sign in once activated (unique per school, ADR-0005) — distinct from their email.',
  })
  @IsString()
  @MinLength(1)
  adminLoginIdentifier!: string;

  @ApiProperty({ type: String, description: 'Subscription plan name/identifier.' })
  @IsString()
  @MinLength(1)
  plan!: string;

  @ApiProperty({ type: Number, description: 'Initial subscription period, in days.', minimum: 1 })
  @IsInt()
  @Min(1)
  initialPeriodDays!: number;

  @ApiPropertyOptional({
    type: String,
    enum: SCHOOL_STARTING_STRUCTURES,
    default: 'EMPTY',
    description:
      'STANDARD creates the standard departments, streams and subjects (ADR-0038); the school edits them after. EMPTY leaves setup to the school.',
  })
  @IsOptional()
  @IsIn(SCHOOL_STARTING_STRUCTURES)
  startingStructure?: SchoolStartingStructure;
}

export class SchoolAddressAvailabilityQueryDto {
  @ApiProperty({ type: String, description: 'The address label to check.' })
  @IsString()
  @MaxLength(63)
  subdomain!: string;
}

export class SchoolAddressSuggestionsQueryDto {
  @ApiProperty({ type: String, description: 'The school name to suggest addresses for.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
