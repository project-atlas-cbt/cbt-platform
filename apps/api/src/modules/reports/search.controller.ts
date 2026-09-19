import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import { SearchQueryDto, SearchResponseDto } from './dto/search.dto.js';
import { SearchService } from './search.service.js';

@ApiTags('reports')
@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}
  @Get('search')
  @Authorized('reporting.search')
  @ApiOperation({ summary: "Role-aware search across only the caller's permitted school corpora." })
  @ApiOkResponse({ type: SearchResponseDto })
  async get(
    @Req() req: FastifyRequest,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    return this.search.search(req.user as AuthenticatedUser, query.q, query.corpus);
  }
}
