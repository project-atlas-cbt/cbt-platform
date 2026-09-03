import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { NotificationType } from '@atlas/domain';

export interface NotificationListResult {
  items: {
    id: string;
    type: NotificationType;
    title: string;
    content: string;
    status: 'UNREAD' | 'READ';
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    createdAt: Date;
    readAt: Date | null;
  }[];
  total: number;
  unreadCount: number;
}

export interface RecordNotificationInput {
  schoolId: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  content: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/**
 * B10: the in-app `Notification` persistence + read-state half of the
 * notification system — 07 §11.2, "operational only, never social" (04
 * §64). Always written regardless of whether an out-of-band (email) send
 * also happens for the same event — see
 * `NotificationDispatchQueueService`/`notification-dispatch-worker-
 * bootstrap.ts` for that separate, retryable pipeline.
 *
 * `record()` is best-effort by design, matching the established
 * `dispatchDecisionNotification` idiom this codebase already used before
 * B10 (question-review.service.ts): a transient failure to persist an
 * in-app notification must never fail the caller's primary action. Callers
 * that already hold an open transaction pass `tx` to write in the same
 * one; callers outside a transaction (e.g. a worker's per-school loop) get
 * a standalone `withTenant` write.
 */
@Injectable()
export class NotificationService {
  async record(event: RecordNotificationInput, tx?: Prisma.TransactionClient): Promise<void> {
    const write = (client: Prisma.TransactionClient) =>
      client.notification.create({
        data: {
          schoolId: event.schoolId,
          recipientUserId: event.recipientUserId,
          type: event.type,
          title: event.title,
          content: event.content,
          // exactOptionalPropertyTypes: an explicit `undefined` is not the
          // same as an absent key, so optional fields are spread in only
          // when actually provided.
          ...(event.relatedEntityType !== undefined && {
            relatedEntityType: event.relatedEntityType,
          }),
          ...(event.relatedEntityId !== undefined && { relatedEntityId: event.relatedEntityId }),
        },
      });

    if (tx) {
      await write(tx);
      return;
    }
    await withTenant(prisma, event.schoolId, (t) => write(t));
  }

  /** `GET /v1/notifications` — recipient's own list, newest first, plus
   * the unread count (shown on the bell trigger regardless of which page
   * is being viewed). Scoping is a plain `{schoolId, recipientUserId}`
   * match — every role only ever sees their own rows, no custom scope
   * resolver needed. */
  async list(
    schoolId: string,
    recipientUserId: string,
    page: number,
    pageSize: number,
  ): Promise<NotificationListResult> {
    return withTenant(prisma, schoolId, async (tx) => {
      const where = { schoolId, recipientUserId };
      const [items, total, unreadCount] = await Promise.all([
        tx.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.notification.count({ where }),
        tx.notification.count({ where: { ...where, status: 'UNREAD' } }),
      ]);
      return { items, total, unreadCount };
    });
  }

  async markRead(schoolId: string, recipientUserId: string, id: string): Promise<void> {
    await withTenant(prisma, schoolId, (tx) =>
      tx.notification.updateMany({
        where: { id, schoolId, recipientUserId },
        data: { status: 'READ', readAt: new Date() },
      }),
    );
  }

  async markAllRead(schoolId: string, recipientUserId: string): Promise<void> {
    await withTenant(prisma, schoolId, (tx) =>
      tx.notification.updateMany({
        where: { schoolId, recipientUserId, status: 'UNREAD' },
        data: { status: 'READ', readAt: new Date() },
      }),
    );
  }

  /** Most recent notification of `type` for `recipientUserId`, if any —
   * used by the unassigned-students digest job's own anti-spam comparison
   * (has the count actually changed since the last notification?), never
   * exposed via an endpoint. */
  async findMostRecentOfType(
    schoolId: string,
    recipientUserId: string,
    type: NotificationType,
  ): Promise<{ content: string } | null> {
    return withTenant(prisma, schoolId, (tx) =>
      tx.notification.findFirst({
        where: { schoolId, recipientUserId, type },
        orderBy: { createdAt: 'desc' },
        select: { content: true },
      }),
    );
  }
}
