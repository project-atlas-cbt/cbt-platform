import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Role } from '@atlas/domain';

/** `GET /v1/audit`'s filter/pagination shape (roadmap: "Scoped audit
 * retrieval with filters: actor, action, entity type, date range").
 * Mirrors `ListSchoolsQueryDto`'s established pagination idiom
 * (school-response.dto.ts) — bound/coerced by the global `ValidationPipe`
 * the same way every other multi-param `@Query()` DTO in this codebase
 * already is. */
export class AuditQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsString()
  actorUserId?: string;

  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;

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
}

/** `GET /v1/platform/audit`'s own shape — same filters, plus an optional
 * `schoolId` narrowing (the same endpoint powers both F3's open,
 * cross-school Audit screen and its per-school Audit/Activity tabs). */
export class PlatformAuditQueryDto extends AuditQueryDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsString()
  schoolId?: string;
}

export class AuditEventResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  /** B20: null for a platform-level event (Software Admin MFA, platform
   * sign-in, operator commands) — only ever returned by
   * `GET /v1/platform/audit`; school-scoped reads never see such rows. */
  @ApiProperty({ type: String, nullable: true })
  schoolId!: string | null;

  @ApiProperty({ type: String })
  actorUserId!: string;

  /** Best-effort — `null` if the actor's User row is no longer resolvable
   * (never blocks the row itself from appearing). */
  @ApiPropertyOptional({ type: String, nullable: true })
  actorDisplayName!: string | null;

  @ApiProperty({ type: String })
  actorRole!: Role;

  @ApiProperty({ type: String })
  action!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  entityType!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  entityId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({ type: Boolean })
  breakGlass!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt!: string;
}

/** `page`/`pageSize`/`total` — same shape as `SchoolListResponseDto`. */
export class AuditListResponseDto {
  @ApiProperty({ type: [AuditEventResponseDto] })
  items!: AuditEventResponseDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
}
