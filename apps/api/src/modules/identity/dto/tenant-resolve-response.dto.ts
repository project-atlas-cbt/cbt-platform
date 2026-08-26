import { ApiProperty } from '@nestjs/swagger';

/**
 * No branding fields yet (logo/colour arrive with B4's School columns) —
 * shaped so B4 extends this response, not replaces it (see
 * IdentityController.resolveTenant's own comment).
 */
export class TenantResolveSchoolDto {
  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  subdomain!: string;

  @ApiProperty({ type: String, description: 'IANA timezone (ADR-0027).' })
  timezone!: string;
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
