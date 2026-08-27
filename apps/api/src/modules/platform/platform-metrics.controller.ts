import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthorizedPlatform } from '../authorization/decorators.js';
import { PlatformMetricsService } from './platform-metrics.service.js';
import { PlatformMetricsResponseDto } from './dto/platform-metrics-response.dto.js';
import { OrphanMediaReportResponseDto } from './dto/orphan-media-report-response.dto.js';

@ApiTags('platform')
@Controller('platform/metrics')
export class PlatformMetricsController {
  constructor(private readonly metrics: PlatformMetricsService) {}

  @Get()
  @AuthorizedPlatform('platform.school.viewMetrics')
  @ApiOperation({ summary: 'Platform dashboard aggregates (04 §6) — cached, never live-computed.' })
  @ApiOkResponse({ type: PlatformMetricsResponseDto })
  async get(): Promise<PlatformMetricsResponseDto> {
    return this.metrics.read();
  }

  @Get('media/orphan-report')
  @AuthorizedPlatform('platform.media.viewOrphanReport')
  @ApiOperation({ summary: 'B4 orphan-media report (report only, never deletes) — cached.' })
  @ApiOkResponse({ type: OrphanMediaReportResponseDto })
  async getOrphanMediaReport(): Promise<OrphanMediaReportResponseDto> {
    return this.metrics.readOrphanMediaReport();
  }
}
