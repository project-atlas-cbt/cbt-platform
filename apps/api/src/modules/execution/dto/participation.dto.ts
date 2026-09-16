import { ApiProperty,ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray,IsDateString,IsNotEmpty,IsOptional,IsString,IsUUID } from 'class-validator';
export const PARTICIPATION_STATUSES=['PENDING','ATTENDED','COMPLETED','ABSENT'] as const; export type ParticipationStatus=(typeof PARTICIPATION_STATUSES)[number];
export const AUTHORIZATION_TYPES=['MAKEUP','RETRY'] as const; export type AuthorizationType=(typeof AUTHORIZATION_TYPES)[number];
export const AUTHORIZATION_STATUSES=['AUTHORIZED','USED','REVOKED','EXPIRED'] as const; export type AuthorizationStatus=(typeof AUTHORIZATION_STATUSES)[number];
export const PARTICIPATION_CLASSIFICATIONS=['PENDING','IN_PROGRESS','COMPLETED','INCOMPLETE','ABSENT','INVALIDATED'] as const; export type ParticipationClassification=(typeof PARTICIPATION_CLASSIFICATIONS)[number];
export class ParticipationRowDto{@ApiProperty()studentProfileId!:string;@ApiProperty()examSessionId!:string;@ApiProperty({enum:PARTICIPATION_STATUSES})participationStatus!:ParticipationStatus;@ApiProperty({enum:PARTICIPATION_CLASSIFICATIONS})classification!:ParticipationClassification;@ApiProperty({nullable:true})attemptId!:string|null;@ApiProperty({nullable:true})attemptState!:string|null}
export class ExamParticipationResponseDto{@ApiProperty({type:[ParticipationRowDto]})items!:ParticipationRowDto[];@ApiProperty()studentCount!:number;@ApiProperty()absentCount!:number;@ApiProperty()incompleteCount!:number}
export class ConfirmAbsencesDto{@ApiProperty({format:'uuid'})@IsUUID()examSessionId!:string;@ApiProperty({type:[String]})@IsArray()@IsUUID(undefined,{each:true})studentProfileIds!:string[];@ApiPropertyOptional()@IsOptional()@IsString()reason?:string}
export class GrantAttemptAuthorizationDto{@ApiProperty({format:'uuid'})@IsUUID()studentProfileId!:string;@ApiProperty()@IsString()@IsNotEmpty()reason!:string;@ApiPropertyOptional({format:'date-time'})@IsOptional()@IsDateString()expiresAt?:string}
export class RevokeAttemptAuthorizationDto{@ApiProperty()@IsString()@IsNotEmpty()reason!:string}
export class InvalidateAttemptDto{@ApiProperty()@IsString()@IsNotEmpty()reason!:string}
export class AttemptAuthorizationResponseDto{@ApiProperty()id!:string;@ApiProperty()examId!:string;@ApiProperty()studentProfileId!:string;@ApiProperty({enum:AUTHORIZATION_TYPES})type!:AuthorizationType;@ApiProperty({enum:AUTHORIZATION_STATUSES})status!:AuthorizationStatus;@ApiProperty()reason!:string;@ApiProperty({nullable:true})expiresAt!:string|null}
