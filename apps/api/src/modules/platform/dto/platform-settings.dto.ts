import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PLATFORM_SETTING_KEYS, type PlatformSettingKey } from '@atlas/config';

const SETTING_VALUE_SCHEMA = {
  oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'array', items: { type: 'string' } }],
};

export class PlatformSettingDto {
  @ApiProperty({ type: String, enum: PLATFORM_SETTING_KEYS })
  key!: PlatformSettingKey;

  @ApiProperty({ type: String, enum: ['operations', 'sign-in'] })
  group!: 'operations' | 'sign-in';

  @ApiProperty({ type: String })
  label!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({
    type: String,
    enum: ['emailList', 'text', 'email', 'timezone', 'duration', 'count'],
  })
  kind!: 'emailList' | 'text' | 'email' | 'timezone' | 'duration' | 'count';

  @ApiPropertyOptional({ type: String, enum: ['minutes', 'hours', 'days'] })
  unit?: 'minutes' | 'hours' | 'days';

  @ApiPropertyOptional({ type: Number, description: 'Seconds for a duration.' })
  min?: number;

  @ApiPropertyOptional({ type: Number, description: 'Seconds for a duration.' })
  max?: number;

  @ApiProperty({ ...SETTING_VALUE_SCHEMA, description: 'The value in effect.' })
  value!: string | number | string[];

  @ApiProperty({ ...SETTING_VALUE_SCHEMA, description: 'The env file value.' })
  defaultValue!: string | number | string[];

  @ApiProperty({ type: Boolean, description: 'True when changed from the env value.' })
  overridden!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'The env variable it overrides.' })
  envKey!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  updatedBy!: string | null;
}

export class PlatformEnvironmentDto {
  @ApiProperty({ type: String })
  releaseVersion!: string;

  @ApiProperty({ type: String, enum: ['ses', 'smtp', 'console'] })
  emailTransport!: 'ses' | 'smtp' | 'console';
}

export class PlatformSettingsResponseDto {
  @ApiProperty({ type: [PlatformSettingDto] })
  settings!: PlatformSettingDto[];

  @ApiProperty({ type: PlatformEnvironmentDto })
  environment!: PlatformEnvironmentDto;
}

export class PlatformSettingChangeDto {
  @ApiProperty({ type: String, enum: PLATFORM_SETTING_KEYS })
  @IsIn(PLATFORM_SETTING_KEYS)
  key!: PlatformSettingKey;

  @ApiProperty({
    ...SETTING_VALUE_SCHEMA,
    nullable: true,
    description: 'The new value (seconds for a duration), or null to return to the default.',
  })
  @Allow()
  value!: string | number | string[] | null;
}

export class UpdatePlatformSettingsDto {
  @ApiProperty({ type: [PlatformSettingChangeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PLATFORM_SETTING_KEYS.length)
  @ValidateNested({ each: true })
  @Type(() => PlatformSettingChangeDto)
  changes!: PlatformSettingChangeDto[];

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class TestEmailResponseDto {
  @ApiProperty({ type: String, description: 'Where the test email went.' })
  sentTo!: string;
}
