import { ApiProperty } from '@nestjs/swagger';

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
