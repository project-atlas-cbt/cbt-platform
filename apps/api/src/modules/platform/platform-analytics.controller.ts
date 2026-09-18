import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthorizedPlatform } from '../authorization/decorators.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { AnalyticsCacheService } from '../analytics/analytics-cache.service.js';
import { PlatformAnalyticsResponseDto } from '../analytics/dto/analytics.dto.js';

@ApiTags('platform')
@Controller('platform/analytics')
export class PlatformAnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly cache: AnalyticsCacheService,
  ) {}

  @Get()
  @AuthorizedPlatform('analytics.platform')
  @ApiOperation({ summary: 'Derived platform business and usage analytics.' })
  @ApiOkResponse({ type: PlatformAnalyticsResponseDto })
  get(): Promise<PlatformAnalyticsResponseDto> {
    return this.cache.readPlatform('overview', () => this.analytics.platform());
  }
}
