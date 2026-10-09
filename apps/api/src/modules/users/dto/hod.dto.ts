import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ListPeopleQueryDto } from './list-query.dto.js';

/** Confirmed with the project owner: an HOD is promoted from an existing
 * teacher's membership, not created as a second, disconnected person
 * record — matching the schema's own documented "a membership may hold
 * TEACHER + HOD" convention. */
export class PromoteHodDto {
  @ApiProperty({ type: String })
  @IsUUID()
  membershipId!: string;
}

export class HodResponseDto {
  @ApiProperty({ type: String })
  membershipId!: string;

  @ApiProperty({ type: String })
  userId!: string;

  @ApiProperty({ type: String })
  teacherProfileId!: string;

  @ApiProperty({ type: String })
  firstName!: string;

  @ApiProperty({ type: String, nullable: true })
  middleName!: string | null;

  @ApiProperty({ type: String })
  lastName!: string;

  /** The natural "First Middle Surname" order. */
  @ApiProperty({ type: String })
  displayName!: string;

  /** "Surname First Middle", the order every list shows (2026-10-09). */
  @ApiProperty({ type: String })
  formalName!: string;

  @ApiProperty({ type: String })
  staffId!: string;

  @ApiProperty({ type: String, nullable: true })
  departmentId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  departmentName!: string | null;
}

export class HodListResponseDto {
  @ApiProperty({ type: HodResponseDto, isArray: true })
  hods!: HodResponseDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
}

const HOD_LIST_SORT_FIELDS = ['staffId', 'lastName'] as const;
type HodListSortField = (typeof HOD_LIST_SORT_FIELDS)[number];

/** F7 gap-closure — see `ListStudentsQueryDto`'s sibling doc comment. */
export class ListHodsQueryDto extends ListPeopleQueryDto {
  @ApiPropertyOptional({ type: String, enum: HOD_LIST_SORT_FIELDS })
  @IsOptional()
  @IsIn(HOD_LIST_SORT_FIELDS)
  sortBy?: HodListSortField;
}

/** F7 decision C — HOD gets its own dedicated edit route (`PATCH /hods/:id`)
 * rather than the frontend silently calling the underlying Teacher
 * endpoint. Mirrors `UpdateTeacherDto`'s shape exactly, since the identity
 * fields being edited are the same underlying `User` row. */
export class UpdateHodDto {
  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  firstName?: string;

  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastName?: string;

  /** Optional third name; an empty string clears it. */
  @ApiPropertyOptional({ type: String, maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  middleName?: string;

  @ApiPropertyOptional({ type: String, maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;
}
