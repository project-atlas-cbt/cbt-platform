import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '../../authorization/decorators.js';
import { ServerKeyRoute } from '../../../security/csrf.guard.js';
import { MarketingIngestGuard } from './marketing-ingest.guard.js';
import { MarketingService } from './marketing.service.js';
import {
  RecordMarketingLeadDto,
  RecordMarketingLeadResponseDto,
  RecordMarketingPageViewsDto,
} from './dto/marketing.dto.js';

const INGEST_REASON =
  'Server to server: called only by the marketing site’s own server, authorized by the shared MARKETING_INGEST_KEY header (MarketingIngestGuard), never by a session (ADR-0034 amendment).';

/**
 * ADR-0034 amendment: the marketing site's server forwards page views (in
 * batches) and the contact forms people send. No browser calls these.
 */
@ApiTags('marketing')
@Controller('marketing')
@ServerKeyRoute()
@UseGuards(MarketingIngestGuard)
export class MarketingIngestController {
  constructor(private readonly marketing: MarketingService) {}

  @Post('page-views')
  @HttpCode(HttpStatus.NO_CONTENT)
  @PublicRoute(INGEST_REASON)
  @ApiOperation({ summary: 'Record a batch of anonymous marketing site page views.' })
  @ApiNoContentResponse()
  async recordPageViews(@Body() body: RecordMarketingPageViewsDto): Promise<void> {
    await this.marketing.recordPageViews(body.views);
  }

  @Post('leads')
  @HttpCode(HttpStatus.CREATED)
  @PublicRoute(INGEST_REASON)
  @ApiOperation({ summary: 'Record a contact a person left on the marketing site, with consent.' })
  @ApiCreatedResponse({ type: RecordMarketingLeadResponseDto })
  recordLead(@Body() body: RecordMarketingLeadDto): Promise<RecordMarketingLeadResponseDto> {
    return this.marketing.recordLead(body);
  }
}
