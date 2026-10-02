import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthorizedPlatform } from '../authorization/decorators.js';
import type { AuthenticatedPlatformUser } from '../identity/auth.guard.js';
import { CreateExportDto, ExportJobResponseDto } from '../reports/dto/export.dto.js';
import { ExportService } from '../reports/export.service.js';
import { RateLimitClass } from '../../security/rate-limit.js';

/** The explicit school segment is the guardrail against accidental
 * platform-wide academic exports. */
@ApiTags('platform')
@Controller('platform/schools/:schoolId/exports')
export class PlatformExportController {
  constructor(private readonly exports: ExportService) {}

  @Post()
  @RateLimitClass('heavy')
  @HttpCode(HttpStatus.ACCEPTED)
  @AuthorizedPlatform('platform.school.viewAll')
  @ApiOperation({ summary: 'Queue an export for one explicitly selected school.' })
  @ApiAcceptedResponse({ type: ExportJobResponseDto })
  create(
    @Req() req: FastifyRequest,
    @Param('schoolId', new ParseUUIDPipe({ version: '7' })) schoolId: string,
    @Body() body: CreateExportDto,
  ) {
    return this.exports.createForPlatform(
      (req.user as AuthenticatedPlatformUser).userId,
      schoolId,
      body,
    );
  }

  @Get(':id')
  @AuthorizedPlatform('platform.school.viewAll')
  @ApiOperation({ summary: 'Get the requesting Software Admin’s school export.' })
  @ApiOkResponse({ type: ExportJobResponseDto })
  get(
    @Req() req: FastifyRequest,
    @Param('schoolId', new ParseUUIDPipe({ version: '7' })) schoolId: string,
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
  ) {
    return this.exports.getForPlatform(
      (req.user as AuthenticatedPlatformUser).userId,
      schoolId,
      id,
    );
  }

  @Get(':id/download')
  @AuthorizedPlatform('platform.school.viewAll')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Stream a requester-bound platform-requested school export.' })
  async download(
    @Req() req: FastifyRequest,
    @Param('schoolId', new ParseUUIDPipe({ version: '7' })) schoolId: string,
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Query('token') token: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.exports.downloadForPlatform(
      (req.user as AuthenticatedPlatformUser).userId,
      schoolId,
      id,
      token,
    );
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .send(file.body);
  }
}
