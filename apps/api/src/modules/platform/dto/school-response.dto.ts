import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  SCHOOL_STATUSES,
  SUBSCRIPTION_STATUSES,
  type SchoolStatus,
  type SubscriptionStatus,
} from '@atlas/domain';

const SCHOOL_LIST_SORT_FIELDS = ['name', 'status', 'createdAt'] as const;
type SchoolListSortField = (typeof SCHOOL_LIST_SORT_FIELDS)[number];
const SORT_DIRECTIONS = ['asc', 'desc'] as const;
type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * Gap closure (F3 DoD item 2, `frontend-roadmap.md`): the first query-param
 * DTO in the codebase — every other `GET` list endpoint uses raw
 * `@Query('name')` string params, but this route now has five related
 * params worth validating together. Global `ValidationPipe`
 * (`transform: true`/`whitelist: true`, `apps/api/src/main.ts`) binds and
 * coerces this the same way `@Body() body: CreateSchoolDto` already does.
 *
 * `sortBy` deliberately excludes `studentCount`: it isn't a column on
 * `School` — it's a per-school count of `RoleAssignment` rows, and
 * `RoleAssignment` has `FORCE ROW LEVEL SECURITY` (ADR-0023), so a single
 * cross-school query ordering by it isn't available without bypassing
 * tenant isolation (the same constraint `B3`'s worker jobs already document
 * for the metrics sweep). Student count stays visible, just not sortable.
 */
export class ListSchoolsQueryDto {
  @ApiPropertyOptional({ type: String, description: 'Comma-separated SchoolStatus values.' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ type: String, description: 'Matches school name or subdomain.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ type: String, enum: SCHOOL_LIST_SORT_FIELDS })
  @IsOptional()
  @IsIn(SCHOOL_LIST_SORT_FIELDS)
  sortBy?: SchoolListSortField;

  @ApiPropertyOptional({ type: String, enum: SORT_DIRECTIONS })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDir?: SortDirection;
}

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

/** `total`/`page`/`pageSize` are the F3 gap-closure (pagination) — `total`
 * is the full matching-row count (before `skip`/`take`), so the frontend
 * can compute `pageCount` for `DataTable`'s pager. */
export class SchoolListResponseDto {
  @ApiProperty({ type: SchoolListItemDto, isArray: true })
  schools!: SchoolListItemDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
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
