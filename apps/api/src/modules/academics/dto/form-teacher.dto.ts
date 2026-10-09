import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class FormTeacherEntryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  teacherProfileId!: string;

  @ApiProperty({ type: String })
  displayName!: string;

  @ApiProperty({ type: String })
  staffId!: string;

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;
}

export class FormTeacherListResponseDto {
  @ApiProperty({ type: FormTeacherEntryDto, isArray: true })
  formTeachers!: FormTeacherEntryDto[];
}

export class ReplaceFormTeachersDto {
  @ApiProperty({
    type: String,
    isArray: true,
    description: 'Every form teacher this class should have; others are ended.',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  teacherProfileIds!: string[];
}

export class MyFormClassDto {
  @ApiProperty({ type: String })
  classId!: string;

  @ApiProperty({ type: String })
  className!: string;

  @ApiProperty({ type: String })
  level!: string;

  @ApiProperty({ type: String })
  arm!: string;

  @ApiProperty({ type: String })
  academicSessionId!: string;
}

export class MyFormClassesResponseDto {
  @ApiProperty({ type: MyFormClassDto, isArray: true })
  classes!: MyFormClassDto[];
}
