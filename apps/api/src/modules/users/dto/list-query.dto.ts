import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * F7 gap-closure (frontend-roadmap.md's F7 DoD item 1): shared pagination/
 * search base for `people.v1`'s four directory list endpoints
 * (Students/Teachers/HODs/Moderators) — none of which supported query
 * params before this. Mirrors `apps/api/src/modules/platform/dto/
 * school-response.dto.ts`'s `ListSchoolsQueryDto` shape exactly (the F3
 * pagination gap-closure this one is modeled on), factored into a shared
 * base class since `dto/` here is one-file-per-entity and four near-
 * identical `page`/`pageSize`/`sortDir` blocks would otherwise duplicate.
 * Each entity's own DTO subclasses this and adds its own `sortBy` against
 * its own allowed column set.
 */
export class ListPeopleQueryDto {
  @ApiPropertyOptional({
    type: String,
    description:
      "Each word must match the entity's own identifier, first name or last name, so a full name matches.",
  })
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

  @ApiPropertyOptional({ type: String, enum: SORT_DIRECTIONS })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDir?: SortDirection;
}
