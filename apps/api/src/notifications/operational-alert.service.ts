import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@atlas/config';
import {
  OPERATIONAL_ALERT_TEMPLATE,
  operationalAlertVariables,
  parseOpsAlertRecipients,
  type NotificationChannel,
  type OperationalAlert,
} from '@atlas/notifications';
import { captureAlert } from '@atlas/observability';
import { NOTIFICATION_CHANNEL } from './notification-tokens.js';

/**
 * B20 security/operational alert dispatch from the API process (break-glass
 * use is the first caller). Three sinks, each independent of the others:
 * a structured log line (always), a Sentry message (when configured), and
 * an email to every `OPS_ALERT_EMAILS` operator via the NotificationChannel.
 * Fire-and-forget by design — an alert must never fail the action that
 * triggered it. apps/worker's Exam Health Monitor dispatches the same
 * template through the shared dispatch queue instead.
 */
@Injectable()
export class OperationalAlertService {
  private readonly logger = new Logger('OperationalAlert');

  constructor(
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
    private readonly config: ConfigService<Env, true>,
  ) {}

  dispatch(alert: OperationalAlert): void {
    const level = alert.severity === 'critical' ? 'error' : 'warn';
    this.logger[level]({ msg: 'Operational alert', ...alert });
    captureAlert(`${alert.title}: ${alert.summary}`, level === 'error' ? 'error' : 'warning', {
      alertKey: alert.alertKey,
      transition: alert.transition,
    });
    const recipients = parseOpsAlertRecipients(
      this.config.get('OPS_ALERT_EMAILS', { infer: true }),
    );
    const variables = operationalAlertVariables(alert);
    for (const to of recipients) {
      this.channel
        .send({ to, template: OPERATIONAL_ALERT_TEMPLATE.name, variables })
        .catch((err: unknown) =>
          this.logger.error({ msg: 'Operational alert delivery failed', err }),
        );
    }
  }
}
