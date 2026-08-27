import { ApiProperty } from '@nestjs/swagger';

/**
 * `04 §6`'s Platform Dashboard top-level metrics. `05 §75`/roadmap:
 * "derived, cached — never authoritative" — computed periodically by the
 * worker sweeper (apps/worker), never live per-request (see this DTO's
 * `computedAt`, which callers should treat as the actual freshness bound).
 * `exams`/`attempts` are honestly `0` until `B11`/`B13` exist — never
 * fabricated.
 */
export class PlatformMetricsResponseDto {
  @ApiProperty({ type: Number })
  totalSchools!: number;

  @ApiProperty({ type: Number })
  activeSchools!: number;

  @ApiProperty({ type: Number })
  provisionalSchools!: number;

  @ApiProperty({ type: Number })
  suspendedSchools!: number;

  @ApiProperty({ type: Number })
  expiredSchools!: number;

  @ApiProperty({ type: Number })
  deactivatedSchools!: number;

  @ApiProperty({ type: Number })
  students!: number;

  @ApiProperty({ type: Number })
  teachers!: number;

  @ApiProperty({
    type: Number,
    description: 'Exams do not exist until B11 — always 0 until then, not fabricated.',
  })
  examsConducted!: number;

  @ApiProperty({
    type: Number,
    description: 'Attempts do not exist until B13 — always 0 until then, not fabricated.',
  })
  attempts!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the worker sweeper last computed this snapshot; null if it has never run.',
  })
  computedAt!: string | null;
}
