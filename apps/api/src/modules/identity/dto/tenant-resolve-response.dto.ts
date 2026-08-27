import { ApiProperty } from '@nestjs/swagger';

/**
 * B4 extended this response with branding fields, exactly as this file's
 * own comment (and TenantBrandLine's on the frontend) anticipated —
 * `logoUrl` is a long-lived signed URL (never a bare public object,
 * ADR-0021's "logo may be cacheable" allowance), safe to expose on this
 * public, unauthenticated route.
 */
export class TenantResolveSchoolDto {
  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  subdomain!: string;

  @ApiProperty({ type: String, description: 'IANA timezone (ADR-0027).' })
  timezone!: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  primaryColor!: string | null;
}

export class TenantResolveResponseDto {
  @ApiProperty({
    type: TenantResolveSchoolDto,
    nullable: true,
    description:
      'null when the request resolved no school (platform host, unrecognised subdomain, or the bare root domain).',
  })
  school!: TenantResolveSchoolDto | null;

  @ApiProperty({ type: String, description: "ADR-0022's double-submit CSRF token." })
  csrfToken!: string;
}
