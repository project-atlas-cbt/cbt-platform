import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { TopicService } from './topic.service.js';
import {
  CreateTopicDto,
  ListTopicsQueryDto,
  TopicListResponseDto,
  TopicResponseDto,
} from './dto/question.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** `questions.v1` — ADR-0001 §3's first-class Topic entity. Not
 * independently permissioned in the table (topics are purely a Question
 * Bank taxonomy concern) — reuses `questionBank.view`/`.create`. */
@ApiTags('questions')
@Controller('topics')
export class TopicController {
  constructor(private readonly topics: TopicService) {}

  @Get()
  @Authorized('questionBank.view')
  @ApiOperation({
    summary: 'List topics for a subject, optionally filtered to one parent (subtopics).',
  })
  @ApiOkResponse({ type: TopicListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Query() query: ListTopicsQueryDto,
  ): Promise<TopicListResponseDto> {
    const topics = await this.topics.list(
      currentUser(req).schoolId,
      query.subjectId,
      query.parentTopicId,
    );
    return { topics };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('questionBank.create')
  @ApiOperation({ summary: 'Create or resolve (case-insensitively) a topic (DoD item 9).' })
  @ApiOkResponse({ type: TopicResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateTopicDto,
  ): Promise<TopicResponseDto> {
    return this.topics.create(currentUser(req).schoolId, body);
  }
}
