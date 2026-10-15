import { Controller, Delete, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthorizedPlatform } from '../../authorization/decorators.js';
import { type AuthenticatedPlatformUser } from '../../identity/auth.guard.js';
import { StatusResponseDto } from '../../identity/dto/status-response.dto.js';
import { MarketingService } from './marketing.service.js';
import {
  MarketingLeadListResponseDto,
  MarketingLeadsQueryDto,
  MarketingSummaryQueryDto,
  MarketingSummaryResponseDto,
} from './dto/marketing.dto.js';

/** ADR-0034 amendment — the Software Admin's Website screen. */
@ApiTags('platform')
@Controller('platform/marketing')
export class PlatformMarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get('summary')
  @AuthorizedPlatform('platform.marketing.view')
  @ApiOperation({ summary: 'Marketing site visits: totals, by day, top pages and sources.' })
  @ApiOkResponse({ type: MarketingSummaryResponseDto })
  summary(@Query() query: MarketingSummaryQueryDto): Promise<MarketingSummaryResponseDto> {
    return this.marketing.summary(query.days ?? 30);
  }

  @Get('leads')
  @AuthorizedPlatform('platform.marketing.view')
  @ApiOperation({ summary: 'Contacts people left on the marketing site, newest first.' })
  @ApiOkResponse({ type: MarketingLeadListResponseDto })
  leads(@Query() query: MarketingLeadsQueryDto): Promise<MarketingLeadListResponseDto> {
    return this.marketing.listLeads(query.page ?? 1, query.pageSize ?? 25);
  }

  @Delete('leads/:id')
  @AuthorizedPlatform('platform.marketing.deleteLead')
  @ApiOperation({ summary: 'Delete a contact (audited, without its personal data).' })
  @ApiOkResponse({ type: StatusResponseDto })
  async deleteLead(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<StatusResponseDto> {
    await this.marketing.deleteLead((req.user as AuthenticatedPlatformUser).userId, id);
    return { status: 'ok' };
  }
}
