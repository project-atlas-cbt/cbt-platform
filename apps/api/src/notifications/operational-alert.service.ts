import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  OPERATIONAL_ALERT_TEMPLATE,
  operationalAlertVariables,
  type NotificationChannel,
  type OperationalAlert,
} from '@atlas/notifications';
import { captureAlert } from '@atlas/observability';
import { NOTIFICATION_CHANNEL } from './notification-tokens.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';

/**
 * B20 security/operational alert dispatch from the API process (break-glass
 * use is the first caller). Three sinks, each independent of the others:
 * a structured log line (always), a Sentry message (when configured), and
 * an email to every operations alert recipient (System Configuration,
 * ADR-0036; `OPS_ALERT_EMAILS` by default) via the NotificationChannel.
 * Fire-and-forget by design — an alert must never fail the action that
 * triggered it. apps/worker's Exam Health Monitor dispatches the same
 * template through the shared dispatch queue instead.
 */
@Injectable()
export class OperationalAlertService {
  private readonly logger = new Logger('OperationalAlert');

  constructor(
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
    private readonly settings: PlatformSettingsService,
  ) {}

  dispatch(alert: OperationalAlert): void {
    const level = alert.severity === 'critical' ? 'error' : 'warn';
    this.logger[level]({ msg: 'Operational alert', ...alert });
    captureAlert(`${alert.title}: ${alert.summary}`, level === 'error' ? 'error' : 'warning', {
      alertKey: alert.alertKey,
      transition: alert.transition,
    });
    const variables = operationalAlertVariables(alert);
    void this.settings.current().then(({ opsAlertEmails }) => {
      for (const to of opsAlertEmails) {
        this.channel
          .send({ to, template: OPERATIONAL_ALERT_TEMPLATE.name, variables })
          .catch((err: unknown) =>
            this.logger.error({ msg: 'Operational alert delivery failed', err }),
          );
      }
    });
  }
}
