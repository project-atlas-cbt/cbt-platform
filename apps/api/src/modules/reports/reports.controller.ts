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
import { Authorized } from '../authorization/decorators.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import { CreateExportDto, ExportJobResponseDto } from './dto/export.dto.js';
import { ExportService } from './export.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(private readonly exports: ExportService) {}

  @Post('exports')
  @HttpCode(HttpStatus.ACCEPTED)
  @Authorized('reporting.exportSchoolData')
  @ApiOperation({ summary: 'Queue a school-scoped CSV export.' })
  @ApiAcceptedResponse({ type: ExportJobResponseDto })
  create(@Req() req: FastifyRequest, @Body() body: CreateExportDto): Promise<ExportJobResponseDto> {
    return this.exports.create(currentUser(req), body);
  }

  @Get('exports/:id')
  @Authorized('reporting.exportSchoolData')
  @ApiOperation({ summary: 'Get own export status. Artefacts are never shared across users.' })
  @ApiOkResponse({ type: ExportJobResponseDto })
  get(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
  ): Promise<ExportJobResponseDto> {
    return this.exports.get(currentUser(req), id);
  }

  @Get('exports/:id/download')
  @Authorized('reporting.exportSchoolData')
  @ApiOperation({ summary: 'Download own completed export through an authenticated route.' })
  @ApiProduces('text/csv')
  async download(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Query('token') token: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.exports.download(currentUser(req), id, token);
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .send(file.body);
  }
}
