import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** `POST /v1/auth/student-sign-in` — Login ID + name, no password. */
export class StudentSignInDto {
  @ApiProperty({ type: String, description: "The student's Login ID." })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  identifier!: string;

  @ApiProperty({
    type: String,
    description: 'First name and surname in any order and any capitals; middle names optional.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

/** `GET/PUT /v1/school/student-passwordless-sign-in`. */
export class StudentPasswordlessSettingsDto {
  @ApiProperty({ type: Boolean, description: 'On for every student of the school.' })
  @IsBoolean()
  allStudents!: boolean;

  @ApiProperty({
    type: String,
    isArray: true,
    format: 'uuid',
    description: 'Classes switched on individually. A PUT replaces the whole list.',
  })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  classIds!: string[];
}
