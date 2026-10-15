import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const MARKETING_LEAD_KINDS = ['DEMO_REQUEST', 'CALL_BACK'] as const;
export type MarketingLeadKindValue = (typeof MARKETING_LEAD_KINDS)[number];
export const MARKETING_DEVICES = ['mobile', 'desktop'] as const;
export const MARKETING_RANGES = [7, 30, 90] as const;

// ---- ingest (marketing site server → API) ---------------------------------

export class MarketingPageViewDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u)
  occurredAt!: string;

  @ApiProperty({ type: String, maxLength: 200, example: '/pricing' })
  @IsString()
  @Matches(/^\/[\w\-./]*$/u)
  @MaxLength(200)
  path!: string;

  @ApiPropertyOptional({ type: String, maxLength: 60, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 120, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referrerHost?: string | null;

  @ApiProperty({ type: String, enum: MARKETING_DEVICES })
  @IsIn(MARKETING_DEVICES)
  device!: (typeof MARKETING_DEVICES)[number];

  @ApiProperty({ type: String, description: 'Day-salted hash; never an IP address.' })
  @IsString()
  @Matches(/^[a-f0-9]{32,64}$/u)
  visitorKey!: string;
}

export class RecordMarketingPageViewsDto {
  @ApiProperty({ type: [MarketingPageViewDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MarketingPageViewDto)
  views!: MarketingPageViewDto[];
}

export class RecordMarketingLeadDto {
  @ApiProperty({ type: String, enum: MARKETING_LEAD_KINDS })
  @IsIn(MARKETING_LEAD_KINDS)
  kind!: MarketingLeadKindValue;

  @ApiProperty({ type: String, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ type: String, maxLength: 24 })
  @IsString()
  @Matches(/^[+\d][\d\s()-]{6,23}$/u)
  phone!: string;

  @ApiPropertyOptional({ type: String, maxLength: 160 })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ type: String, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  school?: string;

  @ApiPropertyOptional({ type: String, maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  role?: string;

  @ApiPropertyOptional({ type: String, maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  @ApiPropertyOptional({ type: String, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  students?: string;

  @ApiPropertyOptional({ type: String, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  interest?: string;

  @ApiPropertyOptional({ type: String, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Same-day visitor key, to attach the pages this browser viewed.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{32,64}$/u)
  visitorKey?: string;
}

export class RecordMarketingLeadResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
}

// ---- Software Admin reads --------------------------------------------------

export class MarketingSummaryQueryDto {
  @ApiPropertyOptional({ type: Number, enum: MARKETING_RANGES, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsIn(MARKETING_RANGES)
  days?: (typeof MARKETING_RANGES)[number];
}

export class MarketingDayDto {
  @ApiProperty({ type: String, example: '2026-10-15', description: 'Lagos calendar day.' })
  date!: string;

  @ApiProperty({ type: Number })
  visits!: number;

  @ApiProperty({ type: Number })
  visitors!: number;
}

export class MarketingCountDto {
  @ApiProperty({ type: String })
  label!: string;

  @ApiProperty({ type: Number, description: 'Page views for a page; visitors for a source.' })
  count!: number;
}

export class MarketingSummaryResponseDto {
  @ApiProperty({ type: Number })
  days!: number;

  @ApiProperty({ type: Number, description: 'Page views in the range.' })
  visits!: number;

  @ApiProperty({
    type: Number,
    description:
      'Distinct visitors per day, added up over the range (no cookies, so a person who returns on another day counts again).',
  })
  visitors!: number;

  @ApiProperty({ type: Number, description: 'Contacts left in the range.' })
  leads!: number;

  @ApiProperty({ type: Number, description: 'Share of visits from a phone, 0–100.' })
  mobilePercent!: number;

  @ApiProperty({ type: [MarketingDayDto] })
  daily!: MarketingDayDto[];

  @ApiProperty({ type: [MarketingCountDto], description: 'Most viewed pages, by page views.' })
  topPages!: MarketingCountDto[];

  @ApiProperty({
    type: [MarketingCountDto],
    description:
      'Where visitors came from, by visitors; "Direct or unknown" when no source was given.',
  })
  topSources!: MarketingCountDto[];
}

export class MarketingLeadsQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class MarketingLeadDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, enum: MARKETING_LEAD_KINDS })
  kind!: MarketingLeadKindValue;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  phone!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  school!: string | null;

  @ApiProperty({ type: String, nullable: true })
  role!: string | null;

  @ApiProperty({ type: String, nullable: true })
  state!: string | null;

  @ApiProperty({ type: String, nullable: true })
  students!: string | null;

  @ApiProperty({ type: String, nullable: true })
  interest!: string | null;

  @ApiProperty({ type: String, nullable: true })
  message!: string | null;

  @ApiProperty({ type: [String] })
  pagesViewed!: string[];

  @ApiProperty({ type: String, nullable: true })
  source!: string | null;
}

export class MarketingLeadListResponseDto {
  @ApiProperty({ type: [MarketingLeadDto] })
  leads!: MarketingLeadDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
}
