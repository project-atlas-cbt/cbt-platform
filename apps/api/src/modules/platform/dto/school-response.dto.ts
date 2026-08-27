import { ApiProperty } from '@nestjs/swagger';
import {
  SCHOOL_STATUSES,
  SUBSCRIPTION_STATUSES,
  type SchoolStatus,
  type SubscriptionStatus,
} from '@atlas/domain';

/** `05 §3.1`'s School List row shape. `subscriptionStatus`/`subscriptionExpiresAt`
 * are an F3 gap-closure (CLAUDE.md's F3 change-log entry) — added to power
 * the Schools list's expiry column, the dashboard's "schools requiring
 * attention" section (05 §2.1), and the Subscriptions nav view (04 §5),
 * none of which had a data source before. Null only for a school with no
 * subscription row at all, which shouldn't happen in practice (school
 * creation always issues a PENDING one) but is defended against anyway. */
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

  @ApiProperty({ type: String, enum: SUBSCRIPTION_STATUSES, nullable: true })
  subscriptionStatus!: SubscriptionStatus | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  subscriptionExpiresAt!: string | null;
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

  @ApiProperty({ type: String, enum: SUBSCRIPTION_STATUSES })
  status!: SubscriptionStatus;

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

const ACTIVATION_GRANT_PURPOSES = ['INITIAL_ACTIVATION', 'RENEWAL'] as const;
const ACTIVATION_GRANT_STATUSES = ['ISSUED', 'ACTIVATED', 'EXPIRED', 'REVOKED'] as const;

/** `05 §4.1`'s "Renewal history / Activation history" — an F3 gap-closure
 * (CLAUDE.md's F3 change-log entry): B3 shipped issuance but never a way to
 * list what had been issued. Deliberately never includes `keyHash` or the
 * raw key — the email is the one-time reveal channel (B3's own design),
 * this is a read-only historical record. */
export class SchoolActivationGrantDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, enum: ACTIVATION_GRANT_PURPOSES })
  purpose!: (typeof ACTIVATION_GRANT_PURPOSES)[number];

  @ApiProperty({ type: String, enum: ACTIVATION_GRANT_STATUSES })
  status!: (typeof ACTIVATION_GRANT_STATUSES)[number];

  @ApiProperty({ type: String, format: 'date-time' })
  issuedAt!: string;

  @ApiProperty({ type: String })
  issuedByDisplayName!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  activatedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ type: String })
  subscriptionId!: string;

  @ApiProperty({ type: String })
  subscriptionPlan!: string;
}

export class SchoolActivationGrantsResponseDto {
  @ApiProperty({ type: SchoolActivationGrantDto, isArray: true })
  grants!: SchoolActivationGrantDto[];
}
