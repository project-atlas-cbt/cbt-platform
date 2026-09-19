import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const SEARCH_CORPORA = [
  'students',
  'teachers',
  'hods',
  'classes',
  'exams',
  'questions',
  'results',
] as const;

export class SearchQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
  @ApiPropertyOptional({ enum: SEARCH_CORPORA, description: 'Optional corpus name.' })
  @IsOptional()
  @IsIn(SEARCH_CORPORA)
  corpus?: (typeof SEARCH_CORPORA)[number];
}
export class SearchItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional() detail?: string;
}
export class SearchResponseDto {
  @ApiProperty({ type: SearchItemDto, isArray: true }) students!: SearchItemDto[];
  @ApiProperty({ type: SearchItemDto, isArray: true }) teachers!: SearchItemDto[];
  @ApiProperty({ type: SearchItemDto, isArray: true }) hods!: SearchItemDto[];
  @ApiProperty({ type: SearchItemDto, isArray: true }) classes!: SearchItemDto[];
  @ApiProperty({ type: SearchItemDto, isArray: true }) exams!: SearchItemDto[];
  @ApiProperty({ type: SearchItemDto, isArray: true }) questions!: SearchItemDto[];
  @ApiProperty({ type: SearchItemDto, isArray: true }) results!: SearchItemDto[];
}
export class PlatformSearchResponseDto {
  @ApiProperty({ type: SearchItemDto, isArray: true }) schools!: SearchItemDto[];
}
