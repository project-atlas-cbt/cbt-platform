import { ApiProperty } from '@nestjs/swagger';

/**
 * B4's "Orphan-media reporting" background job — report only, never
 * deletes (cleanup is a future M-14 retention-policy job). Computed
 * periodically by the worker sweeper (apps/worker), read here from Redis
 * — never live per-request (same "derived, cached" convention as
 * PlatformMetricsResponseDto).
 */
export class OrphanMediaReportResponseDto {
  @ApiProperty({
    type: Number,
    description:
      'Upload requested (presigned PUT issued) but never completed before the URL expired.',
  })
  expiredPendingCount!: number;

  @ApiProperty({
    type: Number,
    description: "A READY, SCHOOL_LOGO-typed asset no school's logoMediaId points to anymore.",
  })
  supersededLogoCount!: number;

  @ApiProperty({
    type: Number,
    description:
      'READY, non-SCHOOL_LOGO assets — nothing references these until B8 (Question/QuestionMedia). Not classified as orphaned or not; counted here only so this report never silently overstates its own coverage.',
  })
  uncheckedReadyCount!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the worker sweeper last computed this snapshot; null if it has never run.',
  })
  computedAt!: string | null;
}
