import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSchoolResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  subdomain!: string;
}

export class IssueSubscriptionResponseDto {
  @ApiProperty({ type: String })
  subscriptionId!: string;
}

export class SchoolAddressAvailabilityResponseDto {
  @ApiProperty({
    type: String,
    description: 'The label as it would be stored (trimmed, lowercase).',
  })
  subdomain!: string;

  @ApiProperty({ type: Boolean })
  available!: boolean;

  @ApiPropertyOptional({ type: String, enum: ['FORMAT', 'LENGTH', 'RESERVED', 'TAKEN'] })
  reason?: 'FORMAT' | 'LENGTH' | 'RESERVED' | 'TAKEN';
}

export class SchoolAddressSuggestionsResponseDto {
  @ApiProperty({ type: [String], description: 'Free, valid addresses, best first.' })
  suggestions!: string[];
}
