import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, prisma } from '@atlas/db';
import { AuthorizedPlatform } from '../authorization/decorators.js';
import { PlatformSearchResponseDto, SearchQueryDto } from '../reports/dto/search.dto.js';

/** Software Admin search is intentionally limited to schools, never academics. */
@ApiTags('platform')
@Controller('platform')
export class PlatformSearchController {
  @Get('search')
  @AuthorizedPlatform('platform.school.viewAll')
  @ApiOperation({ summary: 'Software Admin full-text school search only.' })
  @ApiOkResponse({ type: PlatformSearchResponseDto })
  async search(@Query() query: SearchQueryDto): Promise<PlatformSearchResponseDto> {
    const q = query.q.trim();
    if (q.length < 2) return { schools: [] };
    const candidates = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM schools WHERE to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(subdomain,'')) @@ websearch_to_tsquery('simple', ${q}) LIMIT 50`,
    );
    const schools = await prisma.school.findMany({
      where: { id: { in: candidates.map((candidate) => candidate.id) } },
      take: 10,
      select: { id: true, name: true, subdomain: true },
    });
    return { schools: schools.map((s) => ({ id: s.id, label: s.name, detail: s.subdomain })) };
  }
}
