import {
  ConsoleNotificationChannel,
  type NotificationChannel,
  type TemplateRegistry,
} from '@atlas/notifications';
import type { Env } from '@atlas/config';

import { SkipReservedRecipients } from './reserved-recipients.js';
import { SesNotificationChannel, sesSender } from './ses-channel.js';
import { SmtpNotificationChannel, smtpSender } from './smtp-channel.js';

export type NotificationTransportEnv = Pick<
  Env,
  | 'NODE_ENV'
  | 'NOTIFICATION_TRANSPORT'
  | 'SES_FROM_ADDRESS'
  | 'SES_REGION'
  | 'SMTP_HOST'
  | 'SMTP_PORT'
  | 'SMTP_USER'
  | 'SMTP_PASSWORD'
  | 'SMTP_FROM_ADDRESS'
>;

/**
 * NOTIFICATION_TRANSPORT picks the transport (ADR-0019): Amazon SES (AWS
 * deployments), SMTP (the VPS pilot), or the console for dev and CI. One
 * place, shared by NotificationsModule and the ops CLIs, so a new transport
 * cannot be wired into one and forgotten in the other.
 *
 * B20: the console transport never prints message content (live reset or
 * activation links, recipient address) in production; dev and test runs keep
 * it, since developers and the integration suites read links from it.
 *
 * The real transports skip reserved names such as `@oakridge.example`
 * (reserved-recipients.ts): the demo school runs on the pilot server.
 */
export function createNotificationChannel(
  env: NotificationTransportEnv,
  templates: TemplateRegistry,
): NotificationChannel {
  switch (env.NOTIFICATION_TRANSPORT) {
    case 'ses':
      return new SkipReservedRecipients(
        new SesNotificationChannel(
          templates,
          env.SES_FROM_ADDRESS,
          sesSender(env.SES_REGION || undefined),
        ),
      );
    case 'smtp':
      return new SkipReservedRecipients(
        new SmtpNotificationChannel(
          templates,
          env.SMTP_FROM_ADDRESS,
          smtpSender({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            user: env.SMTP_USER,
            password: env.SMTP_PASSWORD,
          }),
        ),
      );
    case 'console':
      return new ConsoleNotificationChannel(templates, console.log, {
        revealContent: env.NODE_ENV !== 'production',
      });
  }
}
