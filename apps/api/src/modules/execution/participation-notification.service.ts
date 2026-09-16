import { Injectable, Logger } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { NotificationService } from '../notification-center/notification.service.js';

@Injectable()
export class ParticipationNotificationService {
  private readonly logger = new Logger(ParticipationNotificationService.name);

  constructor(private readonly notifications: NotificationService) {}

  /**
   * Notification delivery is intentionally best-effort after the authorization
   * transaction commits. A notification outage must not turn a successfully
   * persisted grant into an apparent failed request that callers then repeat.
   */
  async authorizationGranted(
    schoolId: string,
    studentProfileId: string,
    examId: string,
    type: 'MAKEUP',
  ): Promise<void> {
    try {
      const profile = await withTenant(prisma, schoolId, (tx) =>
        tx.studentProfile.findUnique({
          where: { id: studentProfileId },
          select: { membership: { select: { userId: true } } },
        }),
      );
      if (!profile) return;

      await this.notifications.record({
        schoolId,
        recipientUserId: profile.membership.userId,
        type: 'MAKEUP_GRANTED',
        title: 'Makeup authorized',
        content: 'You have been granted a makeup attempt.',
        relatedEntityType: 'Exam',
        relatedEntityId: examId,
      });
    } catch (error) {
      this.logger.error(
        `Makeup authorization for exam ${examId} committed, but notification persistence failed: ${String(error)}`,
      );
    }
  }
}
