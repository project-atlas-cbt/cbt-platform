import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  CLASS_SUBJECT_KINDS,
  STUDENT_SUBJECT_REGISTRATION_STATUSES,
  type ClassSubjectKind,
  type StudentSubjectRegistrationStatus,
} from '@atlas/domain';

/** ADR-0011 — a student's registration for one of their current
 * enrollment's ClassSubjects, enriched with the subject's own name/code so
 * the list is directly displayable, matching ClassSubjectResponseDto's own
 * enrichment precedent. */
export class StudentSubjectRegistrationResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  studentEnrollmentId!: string;

  @ApiProperty({ type: String })
  classSubjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: String })
  subjectCode!: string;

  @ApiProperty({ type: String, enum: CLASS_SUBJECT_KINDS })
  kind!: ClassSubjectKind;

  @ApiProperty({ type: String, nullable: true })
  choiceGroupName!: string | null;

  @ApiProperty({ type: String, enum: STUDENT_SUBJECT_REGISTRATION_STATUSES })
  status!: StudentSubjectRegistrationStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  registeredAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deregisteredAt!: string | null;
}

/** ADR-0038 — one offering the student's class has but they have no
 * registration row for (an elective they don't take). */
export class AvailableOfferingDto {
  @ApiProperty({ type: String })
  classSubjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: String })
  subjectCode!: string;

  @ApiProperty({ type: String, enum: CLASS_SUBJECT_KINDS })
  kind!: ClassSubjectKind;

  @ApiProperty({ type: String, nullable: true })
  choiceGroupName!: string | null;
}

export class ChoiceWarningDto {
  @ApiProperty({ type: String })
  choiceGroupId!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Number })
  chosen!: number;

  @ApiProperty({ type: Number })
  minChoices!: number;

  @ApiProperty({ type: Number })
  maxChoices!: number;

  @ApiProperty({ type: String })
  message!: string;
}

export class GridOfferingDto {
  @ApiProperty({ type: String })
  classSubjectId!: string;

  @ApiProperty({ type: String })
  subjectId!: string;

  @ApiProperty({ type: String })
  subjectName!: string;

  @ApiProperty({ type: String })
  subjectCode!: string;

  @ApiProperty({ type: String, enum: CLASS_SUBJECT_KINDS })
  kind!: ClassSubjectKind;

  @ApiProperty({ type: String, nullable: true })
  choiceGroupId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  choiceGroupName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'e.g. "Religion: choose 1".' })
  choiceRule!: string | null;
}

export class GridStudentDto {
  @ApiProperty({ type: String })
  enrollmentId!: string;

  @ApiProperty({ type: String })
  studentProfileId!: string;

  @ApiProperty({ type: String })
  studentId!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String, isArray: true })
  registeredClassSubjectIds!: string[];

  @ApiProperty({ type: ChoiceWarningDto, isArray: true })
  warnings!: ChoiceWarningDto[];
}

/** `GET /v1/academics/classes/:id/subject-registrations` — the class
 * subject grid: students down, offerings across. */
export class ClassRegistrationGridResponseDto {
  @ApiProperty({ type: String })
  className!: string;

  @ApiProperty({ type: GridOfferingDto, isArray: true })
  offerings!: GridOfferingDto[];

  @ApiProperty({ type: GridStudentDto, isArray: true })
  students!: GridStudentDto[];
}

export class RegistrationChangeDto {
  @ApiProperty({ type: String })
  @IsUUID()
  enrollmentId!: string;

  @ApiProperty({ type: String })
  @IsUUID()
  classSubjectId!: string;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  registered!: boolean;
}

export class UpdateClassRegistrationsDto {
  @ApiProperty({ type: RegistrationChangeDto, isArray: true, maxItems: 5000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => RegistrationChangeDto)
  changes!: RegistrationChangeDto[];
}

export class UpdateClassRegistrationsResponseDto {
  @ApiProperty({ type: Number })
  changed!: number;
}

export class StudentSubjectRegistrationListResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The current ACTIVE enrollment, if any.',
  })
  enrollmentId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  classId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  className!: string | null;

  @ApiProperty({ type: StudentSubjectRegistrationResponseDto, isArray: true })
  registrations!: StudentSubjectRegistrationResponseDto[];

  @ApiProperty({ type: AvailableOfferingDto, isArray: true })
  availableOfferings!: AvailableOfferingDto[];

  @ApiProperty({ type: ChoiceWarningDto, isArray: true })
  warnings!: ChoiceWarningDto[];
}
