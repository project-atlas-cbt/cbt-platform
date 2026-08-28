import { ApiProperty } from '@nestjs/swagger';
import {
  ACADEMIC_SESSION_STATUSES,
  ACADEMIC_TERM_STATUSES,
  type AcademicSessionStatus,
  type AcademicTermStatus,
} from '@atlas/domain';

export class CurrentSessionSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, enum: ACADEMIC_SESSION_STATUSES })
  status!: AcademicSessionStatus;
}

export class CurrentTermSummaryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Number })
  sequence!: number;

  @ApiProperty({ type: String, enum: ACADEMIC_TERM_STATUSES })
  status!: AcademicTermStatus;
}

/** `GET /v1/academics/context` (roadmap-named endpoint, DoD item 10) — the
 * data F2's already-built context-switcher chrome renders once this exists.
 * `session`/`term` are null, not an error, until a school has activated its
 * first session/term — an honest "not yet set up" rather than a 404, since
 * the school itself and the caller's role are always resolvable. */
export class AcademicsContextResponseDto {
  @ApiProperty({ type: String })
  schoolId!: string;

  @ApiProperty({ type: String })
  schoolName!: string;

  @ApiProperty({ type: CurrentSessionSummaryDto, nullable: true })
  session!: CurrentSessionSummaryDto | null;

  @ApiProperty({ type: CurrentTermSummaryDto, nullable: true })
  term!: CurrentTermSummaryDto | null;
}
