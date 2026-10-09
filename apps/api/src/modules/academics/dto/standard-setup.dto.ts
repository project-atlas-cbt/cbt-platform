import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import type { StandardSetupStage } from '@atlas/domain';

/** NEW: will be created. PLACE: an existing subject with no department that
 * will be put in its standard department (and choice group, if it has none).
 * EXISTS: already there; nothing changes. */
export const STANDARD_SETUP_ITEM_STATUSES = ['NEW', 'PLACE', 'EXISTS'] as const;
export type StandardSetupItemStatus = (typeof STANDARD_SETUP_ITEM_STATUSES)[number];

const STAGES: readonly StandardSetupStage[] = ['JSS', 'SS', 'JSS_AND_SS'];

export class StandardSetupDepartmentDto {
  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, enum: STANDARD_SETUP_ITEM_STATUSES })
  status!: StandardSetupItemStatus;
}

export class StandardSetupStreamDto {
  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, enum: STANDARD_SETUP_ITEM_STATUSES })
  status!: StandardSetupItemStatus;
}

export class StandardSetupSubjectDto {
  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String, description: "The school's own name when it already has it." })
  name!: string;

  @ApiProperty({ type: String })
  departmentCode!: string;

  @ApiProperty({ type: String })
  departmentName!: string;

  @ApiProperty({ type: String, enum: STAGES })
  stage!: StandardSetupStage;

  @ApiProperty({ type: String, nullable: true, description: 'e.g. "Trade subject: choose 1".' })
  choiceGroupName!: string | null;

  @ApiProperty({ type: String, enum: STANDARD_SETUP_ITEM_STATUSES })
  status!: StandardSetupItemStatus;
}

/** `GET /academics/standard-setup` — what applying it would do to this
 * school, item by item. */
export class StandardSetupPreviewResponseDto {
  @ApiProperty({ type: StandardSetupDepartmentDto, isArray: true })
  departments!: StandardSetupDepartmentDto[];

  @ApiProperty({ type: StandardSetupStreamDto, isArray: true })
  streams!: StandardSetupStreamDto[];

  @ApiProperty({ type: StandardSetupSubjectDto, isArray: true })
  subjects!: StandardSetupSubjectDto[];
}

/** `POST /academics/standard-setup` — the standard codes the school ticked.
 * Items already there are ignored. A ticked subject whose department is
 * neither there nor ticked is created with no department. */
export class ApplyStandardSetupDto {
  @ApiProperty({ type: String, isArray: true, example: ['SCI', 'BUS', 'HUM'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  departmentCodes!: string[];

  @ApiProperty({ type: String, isArray: true, example: ['SCI', 'BUS', 'HUM'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  streamCodes!: string[];

  @ApiProperty({ type: String, isArray: true, example: ['MTH', 'ENG'] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  subjectCodes!: string[];
}

export class StandardSetupResultResponseDto {
  @ApiProperty({ type: Number })
  departmentsCreated!: number;

  @ApiProperty({ type: Number })
  streamsCreated!: number;

  @ApiProperty({ type: Number })
  subjectsCreated!: number;

  @ApiProperty({ type: Number, description: 'Existing subjects given their standard department.' })
  subjectsPlaced!: number;

  @ApiProperty({ type: Number })
  choiceGroupsCreated!: number;
}
