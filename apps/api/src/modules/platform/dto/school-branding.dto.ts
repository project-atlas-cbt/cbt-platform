import { ApiProperty } from '@nestjs/swagger';
import { IsHexColor, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class RequestLogoUploadDto {
  @ApiProperty({ type: String, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({
    type: String,
    description:
      'Client-declared MIME type — never trusted alone; complete() re-derives it by sniffing.',
  })
  @IsString()
  declaredMimeType!: string;

  @ApiProperty({ type: Number, description: 'Used to pin Content-Length on the presigned PUT.' })
  @IsInt()
  @Min(1)
  declaredSizeBytes!: number;
}

export class UpdateSchoolBrandingDto {
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    description:
      "A READY, SCHOOL_LOGO-typed asset id from this school's own upload — re-validated server-side (type/status/tenant), which is the real gate here, not a second permission check. Pass null to remove the current logo.",
  })
  @IsOptional()
  @IsUUID()
  logoMediaId?: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    description: '"#rrggbb". Pass null to clear (falls back to the platform default palette).',
  })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string | null;
}

class BrandTokensDto {
  @ApiProperty({ type: String }) brandPrimary!: string;
  @ApiProperty({ type: String }) brandPrimaryHover!: string;
  @ApiProperty({ type: String }) brandPrimaryActive!: string;
  @ApiProperty({ type: String }) brandPrimarySubtle!: string;
  @ApiProperty({ type: String }) brandPrimaryForeground!: string;
}

class NeutralTokensDto {
  @ApiProperty({ type: String }) background!: string;
  @ApiProperty({ type: String }) surface!: string;
  @ApiProperty({ type: String }) surfaceMuted!: string;
  @ApiProperty({ type: String }) border!: string;
  @ApiProperty({ type: String }) borderStrong!: string;
  @ApiProperty({ type: String }) textPrimary!: string;
  @ApiProperty({ type: String }) textSecondary!: string;
  @ApiProperty({ type: String }) textMuted!: string;
  @ApiProperty({ type: String }) textOnBrand!: string;
  @ApiProperty({ type: String }) focusRing!: string;
}

class PaletteAdjustmentDto {
  @ApiProperty({ type: String }) reason!: string;
  @ApiProperty({ type: String }) requestedHex!: string;
  @ApiProperty({ type: String }) appliedHex!: string;
}

export class DerivedPaletteDto {
  @ApiProperty({ type: () => BrandTokensDto }) brand!: BrandTokensDto;
  @ApiProperty({ type: () => NeutralTokensDto }) neutral!: NeutralTokensDto;
  @ApiProperty({ type: () => PaletteAdjustmentDto, nullable: true })
  adjustment!: PaletteAdjustmentDto | null;
}

export class SchoolBrandingResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Long-lived signed URL (ADR-0021: "logo may be cacheable") — never a bare public object.',
  })
  logoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  primaryColor!: string | null;

  @ApiProperty({
    type: () => DerivedPaletteDto,
    nullable: true,
    description:
      "Computed fresh on every read (never cached) via @atlas/domain's derivePalette. Null when primaryColor is unset.",
  })
  palette!: DerivedPaletteDto | null;
}
