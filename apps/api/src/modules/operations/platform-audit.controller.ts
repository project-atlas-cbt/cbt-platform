import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthorizedPlatform } from '../authorization/decorators.js';
import { PlatformAuditReaderService } from './platform-audit-reader.service.js';
import { AuditListResponseDto, PlatformAuditQueryDto } from './dto/audit.dto.js';

/** `GET /v1/platform/audit` — B10, Software-Admin-only. Cross-school,
 * served by `PlatformAuditReaderService`'s privileged `atlas_audit_reader`
 * connection — never the normal per-request tenant-scoped one. Also
 * powers F3's per-school Audit/Activity tabs via the optional `schoolId`
 * filter. */
@ApiTags('platform')
@Controller('platform/audit')
export class PlatformAuditController {
  constructor(private readonly audit: PlatformAuditReaderService) {}

  @Get()
  @AuthorizedPlatform('platform.audit.view')
  @ApiOperation({
    summary: 'Platform-wide audit retrieval, optionally narrowed to one school (B10).',
  })
  @ApiOkResponse({ type: AuditListResponseDto })
  async list(@Query() query: PlatformAuditQueryDto): Promise<AuditListResponseDto> {
    return this.audit.list(query);
  }
}
