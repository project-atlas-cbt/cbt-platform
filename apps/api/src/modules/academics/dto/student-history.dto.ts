import { ApiProperty } from '@nestjs/swagger';

export const HISTORY_EVENT_KINDS = [
  'ENROLLED',
  'MOVED',
  'STARTED_SESSION',
  'SUBJECT_ADDED',
  'SUBJECT_DROPPED',
  'ACCOUNT',
] as const;
export type HistoryEventKind = (typeof HISTORY_EVENT_KINDS)[number];

export class HistoryEventDto {
  @ApiProperty({ type: String, format: 'date-time' })
  at!: string;

  @ApiProperty({ type: String, enum: HISTORY_EVENT_KINDS })
  kind!: HistoryEventKind;

  @ApiProperty({ type: String, description: 'What changed, e.g. "Moved SS1A → SS1B".' })
  summary!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Extra detail, e.g. subjects carried over.',
  })
  detail!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null when the system made the change.',
  })
  actorName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  actorRole!: string | null;
}

export class HistoryOutcomeDto {
  @ApiProperty({ type: String, description: 'e.g. "Promoted", "Repeated", "Graduated".' })
  label!: string;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({ type: String, nullable: true })
  actorName!: string | null;
}

export class HistoryExamsDto {
  @ApiProperty({ type: Number })
  attended!: number;

  @ApiProperty({ type: Number })
  absent!: number;

  @ApiProperty({ type: Number })
  excused!: number;
}

export class HistorySessionDto {
  @ApiProperty({ type: String })
  academicSessionId!: string;

  @ApiProperty({ type: String })
  sessionName!: string;

  @ApiProperty({
    type: String,
    description: 'The class the student ended the session in, or is in now.',
  })
  className!: string;

  @ApiProperty({ type: Boolean })
  current!: boolean;

  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Subjects taken in that class, by name.',
  })
  subjects!: string[];

  @ApiProperty({ type: HistoryEventDto, isArray: true, description: 'Newest first.' })
  events!: HistoryEventDto[];

  @ApiProperty({ type: HistoryOutcomeDto, nullable: true })
  outcome!: HistoryOutcomeDto | null;

  @ApiProperty({ type: HistoryExamsDto })
  exams!: HistoryExamsDto;
}

export class StudentHistoryResponseDto {
  @ApiProperty({ type: HistorySessionDto, isArray: true, description: 'Newest session first.' })
  sessions!: HistorySessionDto[];

  @ApiProperty({
    type: HistoryEventDto,
    isArray: true,
    description: 'Account events, newest first.',
  })
  accountEvents!: HistoryEventDto[];
}
