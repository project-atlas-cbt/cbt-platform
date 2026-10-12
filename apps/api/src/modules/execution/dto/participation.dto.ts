import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class GrantMakeupAuthorizationDto {
  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  studentProfileIds!: string[];
  @ApiProperty() @IsString() @IsNotEmpty() @Matches(/\S/) reason!: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() expiresAt?: string;
}

export class GrantRetryAuthorizationDto {
  @ApiProperty() @IsUUID() studentProfileId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @Matches(/\S/) reason!: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() expiresAt?: string;
}

export class InvalidateAttemptDto {
  @ApiProperty() @IsString() @IsNotEmpty() @Matches(/\S/) reason!: string;
}

export class ParticipationSessionFactDto {
  @ApiProperty() examSessionId!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ nullable: true }) attemptId!: string | null;
  @ApiPropertyOptional({ nullable: true }) resultId!: string | null;
}

export class ParticipationStudentDto {
  @ApiProperty() studentProfileId!: string;
  @ApiProperty() studentName!: string;
  @ApiProperty() studentIdNumber!: string;
  @ApiProperty() rollupStatus!: string;
  @ApiProperty({ type: ParticipationSessionFactDto, isArray: true })
  sessions!: ParticipationSessionFactDto[];
}

export class ExamParticipationResponseDto {
  @ApiProperty() examId!: string;
  @ApiProperty({ type: ParticipationStudentDto, isArray: true })
  students!: ParticipationStudentDto[];
}
