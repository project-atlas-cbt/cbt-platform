import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class PlatformLoginDto {
  @ApiProperty({ type: String, description: "Software Admin's account email." })
  @IsEmail()
  email!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  password!: string;
}
