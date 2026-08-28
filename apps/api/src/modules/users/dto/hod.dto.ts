import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

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

  @ApiProperty({ type: String })
  lastName!: string;

  @ApiProperty({ type: String })
  displayName!: string;

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
}
