import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { NotificationService } from './notification.service.js';
import {
  ListNotificationsQueryDto,
  MarkReadResponseDto,
  NotificationListResponseDto,
} from './dto/notification.dto.js';

const DEFAULT_PAGE_SIZE = 25;

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** B10 — the recipient's own in-app notification list and read-state.
 * Scoping is always `{schoolId, recipientUserId: self}` — every role only
 * ever sees/marks-read their own notifications. */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @Authorized('notification.viewOwn')
  @ApiOperation({ summary: "Current user's notifications, newest first, plus unread count (B10)." })
  @ApiOkResponse({ type: NotificationListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationListResponseDto> {
    const user = currentUser(req);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const result = await this.notifications.list(user.schoolId, user.userId, page, pageSize);
    return {
      items: result.items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        content: n.content,
        status: n.status,
        relatedEntityType: n.relatedEntityType,
        relatedEntityId: n.relatedEntityId,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt ? n.readAt.toISOString() : null,
      })),
      total: result.total,
      page,
      pageSize,
      unreadCount: result.unreadCount,
    };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @Authorized('notification.markRead')
  @ApiOperation({ summary: 'Mark one notification read (B10).' })
  @ApiOkResponse({ type: MarkReadResponseDto })
  async markRead(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<MarkReadResponseDto> {
    const user = currentUser(req);
    await this.notifications.markRead(user.schoolId, user.userId, id);
    return { status: 'ok' };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @Authorized('notification.markRead')
  @ApiOperation({ summary: 'Mark every unread notification read (B10).' })
  @ApiOkResponse({ type: MarkReadResponseDto })
  async markAllRead(@Req() req: FastifyRequest): Promise<MarkReadResponseDto> {
    const user = currentUser(req);
    await this.notifications.markAllRead(user.schoolId, user.userId);
    return { status: 'ok' };
  }
}
