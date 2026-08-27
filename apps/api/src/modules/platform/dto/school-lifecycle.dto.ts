import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

/** Every platform lifecycle-transition endpoint (suspend/deactivate)
 * requires a reason — ADR-0012: "Every lifecycle transition emits an audit
 * event with actor and reason." */
export class SchoolLifecycleReasonDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class IssueSubscriptionDto {
  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  plan!: string;

  @ApiProperty({ type: Number, description: 'New subscription period, in days.', minimum: 1 })
  @IsInt()
  @Min(1)
  periodDays!: number;
}
