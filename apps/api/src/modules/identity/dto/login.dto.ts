import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    type: String,
    description: 'Login identifier — username or school-issued student ID.',
  })
  @IsString()
  @MinLength(1)
  identifier!: string;

  @ApiProperty({ type: String })
  @IsString()
  @MinLength(1)
  password!: string;
}
