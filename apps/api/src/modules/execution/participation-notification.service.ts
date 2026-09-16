import { Injectable, Logger } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { NotificationService } from '../notification-center/notification.service.js';

@Injectable()
export class ParticipationNotificationService {
  private readonly logger = new Logger(ParticipationNotificationService.name);

  constructor(private readonly notifications: NotificationService) {}

  async makeupGranted(
    schoolId: string,
    studentProfileIds: readonly string[],
    examId: string,
  ): Promise<void> {
    try {
      const recipients = await withTenant(prisma, schoolId, (tx) =>
        tx.studentProfile.findMany({
          where: { schoolId, id: { in: [...new Set(studentProfileIds)] } },
          select: { membership: { select: { userId: true } } },
        }),
      );
      await Promise.all(
        recipients.map(({ membership }) =>
          this.notifications.record({
            schoolId,
            recipientUserId: membership.userId,
            type: 'MAKEUP_GRANTED',
            title: 'Makeup authorized',
            content: 'You have been granted a makeup attempt.',
            relatedEntityType: 'Exam',
            relatedEntityId: examId,
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Makeup authorizations for exam ${examId} committed, but notification persistence failed: ${String(error)}`,
      );
    }
  }
}
