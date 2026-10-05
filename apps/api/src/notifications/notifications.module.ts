import { Global, Module } from '@nestjs/common';
import {
  OPERATIONAL_ALERT_TEMPLATE,
  TemplateRegistry,
  type NotificationChannel,
} from '@atlas/notifications';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@atlas/config';

import { NOTIFICATION_CHANNEL, NOTIFICATION_TEMPLATE_REGISTRY } from './notification-tokens.js';
import { OperationalAlertService } from './operational-alert.service.js';
import { createNotificationChannel } from './create-channel.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';

export { NOTIFICATION_CHANNEL, NOTIFICATION_TEMPLATE_REGISTRY };

/** B20: the operational-alert template lives with the registry itself —
 * it belongs to no product module, and apps/worker's Exam Health Monitor
 * enqueues it for this process to render. */
function createRegistry(): TemplateRegistry {
  const registry = new TemplateRegistry();
  registry.register(OPERATIONAL_ALERT_TEMPLATE);
  return registry;
}

/**
 * ADR-0019: wires @atlas/notifications' NotificationChannel abstraction
 * into Nest's DI so B1/B3/B10 can inject NOTIFICATION_CHANNEL rather than
 * constructing a provider themselves. The registry is exported too, since
 * each phase that sends a real message registers its own template against
 * it (see packages/notifications' README) — there's exactly one registry
 * for the process, not one per call site.
 *
 * NOTIFICATION_TRANSPORT picks the transport (createNotificationChannel):
 * Amazon SES or SMTP in production, the console for dev and CI. Call sites
 * never change, which is the whole point of depending on the interface.
 */
@Global()
@Module({
  providers: [
    { provide: NOTIFICATION_TEMPLATE_REGISTRY, useFactory: createRegistry },
    {
      provide: NOTIFICATION_CHANNEL,
      inject: [NOTIFICATION_TEMPLATE_REGISTRY, ConfigService, PlatformSettingsService],
      useFactory: (
        registry: TemplateRegistry,
        config: ConfigService<Env, true>,
        settings: PlatformSettingsService,
      ): NotificationChannel =>
        createNotificationChannel(
          {
            NODE_ENV: config.get('NODE_ENV', { infer: true }),
            NOTIFICATION_TRANSPORT: config.get('NOTIFICATION_TRANSPORT', { infer: true }),
            SES_FROM_ADDRESS: config.get('SES_FROM_ADDRESS', { infer: true }),
            SES_REGION: config.get('SES_REGION', { infer: true }),
            SMTP_HOST: config.get('SMTP_HOST', { infer: true }),
            SMTP_PORT: config.get('SMTP_PORT', { infer: true }),
            SMTP_USER: config.get('SMTP_USER', { infer: true }),
            SMTP_PASSWORD: config.get('SMTP_PASSWORD', { infer: true }),
            SMTP_FROM_ADDRESS: config.get('SMTP_FROM_ADDRESS', { infer: true }),
          },
          registry,
          () => settings.sender(),
        ),
    },
    OperationalAlertService,
  ],
  exports: [NOTIFICATION_CHANNEL, NOTIFICATION_TEMPLATE_REGISTRY, OperationalAlertService],
})
export class NotificationsModule {}
