import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { SCHOOL_STATUSES, type SchoolStatus } from '@atlas/domain';
import { AuthorizedPlatform } from '../authorization/decorators.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { type AuthenticatedPlatformUser } from '../identity/auth.guard.js';
import { SchoolsAdminService } from './schools-admin.service.js';
import { CreateSchoolDto } from './dto/create-school.dto.js';
import { IssueSubscriptionDto, SchoolLifecycleReasonDto } from './dto/school-lifecycle.dto.js';
import { SchoolDetailResponseDto, SchoolListResponseDto } from './dto/school-response.dto.js';
import {
  CreateSchoolResponseDto,
  IssueSubscriptionResponseDto,
} from './dto/create-school-response.dto.js';

function currentPlatformUser(req: FastifyRequest): AuthenticatedPlatformUser {
  return req.user as AuthenticatedPlatformUser;
}

function parseStatusFilter(raw: string | undefined): SchoolStatus[] | undefined {
  if (!raw) return undefined;
  const values = raw.split(',').map((v) => v.trim().toUpperCase());
  const valid = values.filter((v): v is SchoolStatus =>
    (SCHOOL_STATUSES as readonly string[]).includes(v),
  );
  return valid.length > 0 ? valid : undefined;
}

@ApiTags('platform')
@Controller('platform/schools')
export class SchoolsAdminController {
  constructor(private readonly schools: SchoolsAdminService) {}

  @Get()
  @AuthorizedPlatform('platform.school.viewAll')
  @ApiOperation({ summary: 'List schools (05 §3.1) — optional comma-separated status filter.' })
  @ApiOkResponse({ type: SchoolListResponseDto })
  async list(@Query('status') status?: string): Promise<SchoolListResponseDto> {
    const schools = await this.schools.list(parseStatusFilter(status));
    return { schools };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @AuthorizedPlatform('platform.school.create')
  @ApiOperation({ summary: 'Create a school + initial admin + subscription (05 §3.2).' })
  @ApiOkResponse({ type: CreateSchoolResponseDto })
  async create(
    @Body() body: CreateSchoolDto,
    @Req() req: FastifyRequest,
  ): Promise<CreateSchoolResponseDto> {
    const actor = currentPlatformUser(req);
    return this.schools.create(body, actor.userId);
  }

  @Get(':id')
  @AuthorizedPlatform('platform.school.viewAll')
  @ApiOperation({ summary: 'School overview (05 §3.3 / 04 §8).' })
  @ApiOkResponse({ type: SchoolDetailResponseDto })
  async detail(@Param('id') id: string): Promise<SchoolDetailResponseDto> {
    return this.schools.detail(id);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @AuthorizedPlatform('platform.school.suspend')
  @ApiOperation({ summary: 'Suspend a school (platform action, reason required, audited).' })
  @ApiOkResponse({ type: StatusResponseDto })
  async suspend(
    @Param('id') id: string,
    @Body() body: SchoolLifecycleReasonDto,
    @Req() req: FastifyRequest,
  ): Promise<StatusResponseDto> {
    const actor = currentPlatformUser(req);
    await this.schools.suspend(id, body.reason, actor.userId);
    return { status: 'ok' as const };
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @AuthorizedPlatform('platform.school.activate')
  @ApiOperation({ summary: 'Reactivate a suspended school (reason required, audited).' })
  @ApiOkResponse({ type: StatusResponseDto })
  async reactivate(
    @Param('id') id: string,
    @Body() body: SchoolLifecycleReasonDto,
    @Req() req: FastifyRequest,
  ): Promise<StatusResponseDto> {
    const actor = currentPlatformUser(req);
    await this.schools.reactivate(id, body.reason, actor.userId);
    return { status: 'ok' as const };
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @AuthorizedPlatform('platform.school.revokeAccess')
  @ApiOperation({ summary: 'Deactivate a school — terminal, reason required, audited.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async deactivate(
    @Param('id') id: string,
    @Body() body: SchoolLifecycleReasonDto,
    @Req() req: FastifyRequest,
  ): Promise<StatusResponseDto> {
    const actor = currentPlatformUser(req);
    await this.schools.deactivate(id, body.reason, actor.userId);
    return { status: 'ok' as const };
  }

  @Post(':id/subscriptions')
  @HttpCode(HttpStatus.OK)
  @AuthorizedPlatform('platform.subscription.renew')
  @ApiOperation({ summary: 'Issue or renew a subscription period.' })
  @ApiOkResponse({ type: IssueSubscriptionResponseDto })
  async issueSubscription(
    @Param('id') id: string,
    @Body() body: IssueSubscriptionDto,
    @Req() req: FastifyRequest,
  ): Promise<IssueSubscriptionResponseDto> {
    const actor = currentPlatformUser(req);
    return this.schools.issueSubscription(id, body, actor.userId);
  }

  @Post(':id/activation-grants')
  @HttpCode(HttpStatus.OK)
  @AuthorizedPlatform('platform.subscription.renew')
  @ApiOperation({
    summary: 'Issue a standalone renewal key against the current subscription period.',
  })
  @ApiOkResponse({ type: IssueSubscriptionResponseDto })
  async issueActivationGrant(
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ): Promise<IssueSubscriptionResponseDto> {
    const actor = currentPlatformUser(req);
    return this.schools.issueActivationGrant(id, actor.userId);
  }
}
