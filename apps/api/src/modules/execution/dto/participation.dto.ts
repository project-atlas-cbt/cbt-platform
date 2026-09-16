import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  ATTEMPT_AUTHORIZATION_STATUSES as AUTHORIZATION_STATUSES,
  ATTEMPT_AUTHORIZATION_TYPES as AUTHORIZATION_TYPES,
  ATTEMPT_PARTICIPATION_CLASSIFICATIONS as CLASSIFICATIONS,
  PARTICIPATION_STATUSES,
  type AttemptAuthorizationStatus as AuthorizationStatus,
  type AttemptAuthorizationType as AuthorizationType,
  type AttemptParticipationClassification as Classification,
  type ParticipationStatus,
} from '@atlas/domain';

export class ParticipationAuthorizationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) studentProfileId!: string;
  @ApiProperty({ enum: AUTHORIZATION_TYPES }) type!: AuthorizationType;
  @ApiProperty({ enum: AUTHORIZATION_STATUSES }) status!: AuthorizationStatus;
  @ApiProperty() reason!: string;
  @ApiProperty({ format: 'date-time' }) authorizedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) expiresAt!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) sourceExamSessionId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) sourceParticipationId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) sourceAttemptId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) usedByAttemptId!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) usedAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) revokedAt!: string | null;
  @ApiProperty({ nullable: true }) revokedReason!: string | null;
  @ApiProperty() revocable!: boolean;
}

export class ParticipationRowDto {
  @ApiProperty({ format: 'uuid' }) studentProfileId!: string;
  @ApiProperty() studentName!: string;
  @ApiProperty() studentIdentifier!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) classId!: string | null;
  @ApiProperty({ nullable: true }) className!: string | null;
  @ApiProperty({ format: 'uuid' }) examSessionId!: string;
  @ApiProperty() sessionLabel!: string;
  @ApiProperty() sessionType!: string;
  @ApiProperty() sessionStatus!: string;
  @ApiProperty({ format: 'date-time' }) sessionOpenedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) sessionClosedAt!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) sessionCompletedAt!: string | null;
  @ApiProperty({ enum: PARTICIPATION_STATUSES }) participationStatus!: ParticipationStatus;
  @ApiProperty({ enum: CLASSIFICATIONS }) classification!: Classification;
  @ApiProperty({ format: 'uuid', nullable: true }) participationId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) attemptId!: string | null;
  @ApiProperty({ nullable: true }) attemptState!: string | null;
  @ApiProperty({ nullable: true }) invalidationReason!: string | null;
  @ApiProperty() canConfirmAbsence!: boolean;
  @ApiProperty({ type: [ParticipationAuthorizationDto] }) authorizations!: ParticipationAuthorizationDto[];
}

export class ParticipationCountsDto {
  @ApiProperty() sittingCount!: number;
  @ApiProperty() pendingCount!: number;
  @ApiProperty() inProgressCount!: number;
  @ApiProperty() completedCount!: number;
  @ApiProperty() incompleteCount!: number;
  @ApiProperty() absentCount!: number;
  @ApiProperty() invalidatedCount!: number;
}

export class StudentParticipationRollupDto {
  @ApiProperty({ format: 'uuid' }) studentProfileId!: string;
  @ApiProperty() studentName!: string;
  @ApiProperty() studentIdentifier!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) classId!: string | null;
  @ApiProperty({ nullable: true }) className!: string | null;
  @ApiProperty({ enum: CLASSIFICATIONS }) classification!: Classification;
  @ApiProperty() sittingCount!: number;
  @ApiProperty({ type: [String], format: 'uuid' }) examSessionIds!: string[];
  @ApiProperty({ format: 'uuid', nullable: true }) originalExamSessionId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) latestExamSessionId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) actionableAbsenceParticipationId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) latestAttemptId!: string | null;
  @ApiProperty({ nullable: true }) latestInvalidationReason!: string | null;
  @ApiProperty({ type: [ParticipationAuthorizationDto] }) authorizations!: ParticipationAuthorizationDto[];
}

export class ExamParticipationResponseDto {
  @ApiProperty({ type: [ParticipationRowDto] }) items!: ParticipationRowDto[];
  @ApiProperty({ type: [StudentParticipationRollupDto] }) studentRollups!: StudentParticipationRollupDto[];
  @ApiProperty() studentCount!: number;
  @ApiProperty({ type: ParticipationCountsDto }) sittingCounts!: ParticipationCountsDto;
}

export class ConfirmAbsencesDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() examSessionId!: string;
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsUUID(undefined, { each: true }) studentProfileIds!: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class GrantAttemptAuthorizationDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() studentProfileId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() sourceId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() expiresAt?: string;
}

export class BulkGrantMakeupDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() examSessionId!: string;
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsUUID(undefined, { each: true }) studentProfileIds!: string[];
  @ApiProperty() @IsString() @IsNotEmpty() reason!: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() expiresAt?: string;
}

export class BulkGrantMakeupResponseDto {
  @ApiProperty({ type: [ParticipationAuthorizationDto] }) authorizations!: ParticipationAuthorizationDto[];
}
export class RevokeAttemptAuthorizationDto { @ApiProperty() @IsString() @IsNotEmpty() reason!: string; }
export class InvalidateAttemptDto { @ApiProperty() @IsString() @IsNotEmpty() reason!: string; }

export class StudentParticipationSittingDto {
  @ApiProperty({ format: 'uuid' }) examSessionId!: string;
  @ApiProperty() sessionLabel!: string;
  @ApiProperty() sessionType!: string;
  @ApiProperty() sessionStatus!: string;
  @ApiProperty({ enum: PARTICIPATION_STATUSES }) participationStatus!: ParticipationStatus;
  @ApiProperty({ enum: CLASSIFICATIONS }) classification!: Classification;
  @ApiProperty({ nullable: true }) attemptState!: string | null;
  @ApiProperty({ nullable: true }) invalidationReason!: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) markedAt!: string | null;
  @ApiProperty({ type: [ParticipationAuthorizationDto] }) sourceAuthorizations!: ParticipationAuthorizationDto[];
}

export class StudentParticipationHistoryItemDto {
  @ApiProperty({ format: 'uuid' }) examId!: string;
  @ApiProperty() examTitle!: string;
  @ApiProperty() subjectName!: string;
  @ApiProperty({ enum: CLASSIFICATIONS }) classification!: Classification;
  @ApiProperty({ type: [StudentParticipationSittingDto] }) sittings!: StudentParticipationSittingDto[];
  @ApiProperty({ type: [ParticipationAuthorizationDto] }) authorizations!: ParticipationAuthorizationDto[];
}
export class StudentParticipationHistoryResponseDto {
  @ApiProperty({ type: [StudentParticipationHistoryItemDto] }) items!: StudentParticipationHistoryItemDto[];
}
