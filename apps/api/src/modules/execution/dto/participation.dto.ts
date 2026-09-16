import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import {
  ATTEMPT_AUTHORIZATION_STATUSES as AUTHORIZATION_STATUSES,
  ATTEMPT_AUTHORIZATION_TYPES as AUTHORIZATION_TYPES,
  ATTEMPT_PARTICIPATION_CLASSIFICATIONS as PARTICIPATION_CLASSIFICATIONS,
  PARTICIPATION_STATUSES,
  type AttemptAuthorizationStatus as AuthorizationStatus,
  type AttemptAuthorizationType as AuthorizationType,
  type AttemptParticipationClassification as ParticipationClassification,
  type ParticipationStatus,
} from '@atlas/domain';

export {
  AUTHORIZATION_STATUSES,
  AUTHORIZATION_TYPES,
  PARTICIPATION_CLASSIFICATIONS,
  PARTICIPATION_STATUSES,
};
export type {
  AuthorizationStatus,
  AuthorizationType,
  ParticipationClassification,
  ParticipationStatus,
};

export class ParticipationRowDto {
  @ApiProperty({ format: 'uuid' }) studentProfileId!: string;
  @ApiProperty({ format: 'uuid' }) examSessionId!: string;
  @ApiProperty({ enum: PARTICIPATION_STATUSES }) participationStatus!: ParticipationStatus;
  @ApiProperty({ enum: PARTICIPATION_CLASSIFICATIONS })
  classification!: ParticipationClassification;
  @ApiProperty({ nullable: true, format: 'uuid' }) attemptId!: string | null;
  @ApiProperty({ nullable: true }) attemptState!: string | null;
}

export class ExamParticipationResponseDto {
  @ApiProperty({ type: [ParticipationRowDto] }) items!: ParticipationRowDto[];
  @ApiProperty() studentCount!: number;
  @ApiProperty() absentCount!: number;
  @ApiProperty() incompleteCount!: number;
}

export class ConfirmAbsencesDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  examSessionId!: string;

  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  studentProfileIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class GrantAttemptAuthorizationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  studentProfileId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class RevokeAttemptAuthorizationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class InvalidateAttemptDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class AttemptAuthorizationResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) examId!: string;
  @ApiProperty({ format: 'uuid' }) studentProfileId!: string;
  @ApiProperty({ enum: AUTHORIZATION_TYPES }) type!: AuthorizationType;
  @ApiProperty({ enum: AUTHORIZATION_STATUSES }) status!: AuthorizationStatus;
  @ApiProperty() reason!: string;
  @ApiProperty({ nullable: true, format: 'date-time' }) expiresAt!: string | null;
}
