import { ApiProperty } from '@nestjs/swagger';
import { SCHOOL_STATUSES, type SchoolStatus } from '@atlas/domain';

/** `05 §3.1`'s School List row shape. */
export class SchoolListItemDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  subdomain!: string;

  @ApiProperty({ type: String, enum: SCHOOL_STATUSES })
  status!: SchoolStatus;

  @ApiProperty({ type: Number, description: 'Active SchoolMembership count with a STUDENT role.' })
  studentCount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class SchoolListResponseDto {
  @ApiProperty({ type: SchoolListItemDto, isArray: true })
  schools!: SchoolListItemDto[];
}

export class SchoolSubscriptionSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  plan!: string;

  @ApiProperty({ type: String })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  startAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

export class SchoolUsageDto {
  @ApiProperty({ type: Number })
  students!: number;

  @ApiProperty({ type: Number })
  teachers!: number;

  @ApiProperty({
    type: Number,
    description: 'Exams do not exist until B11 — always 0 until then, not fabricated.',
  })
  exams!: number;

  @ApiProperty({
    type: Number,
    description: 'Attempts do not exist until B13 — always 0 until then, not fabricated.',
  })
  attempts!: number;
}

/** `05 §3.3`/`04 §8`'s School Detail shape — a platform-level overview, not
 * a duplicate of the school's own application. */
export class SchoolDetailResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  subdomain!: string;

  @ApiProperty({ type: String, enum: SCHOOL_STATUSES })
  status!: SchoolStatus;

  @ApiProperty({ type: String, nullable: true })
  shortName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactEmail!: string | null;

  @ApiProperty({ type: String, nullable: true })
  contactPhone!: string | null;

  @ApiProperty({ type: String })
  timezone!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: SchoolSubscriptionSummaryDto, nullable: true })
  subscription!: SchoolSubscriptionSummaryDto | null;

  @ApiProperty({ type: SchoolUsageDto })
  usage!: SchoolUsageDto;
}
