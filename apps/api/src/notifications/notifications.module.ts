import { Global, Module } from '@nestjs/common';
import {
  ConsoleNotificationChannel,
  OPERATIONAL_ALERT_TEMPLATE,
  TemplateRegistry,
  type NotificationChannel,
} from '@atlas/notifications';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@atlas/config';

import { NOTIFICATION_CHANNEL, NOTIFICATION_TEMPLATE_REGISTRY } from './notification-tokens.js';
import { OperationalAlertService } from './operational-alert.service.js';

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
 * Bound to ConsoleNotificationChannel — B0's decided provider. Swapping in
 * a real email provider (B23) is a one-line change here, not a call-site
 * change, which is the whole point of depending on the interface.
 */
@Global()
@Module({
  providers: [
    { provide: NOTIFICATION_TEMPLATE_REGISTRY, useFactory: createRegistry },
    {
      provide: NOTIFICATION_CHANNEL,
      inject: [NOTIFICATION_TEMPLATE_REGISTRY, ConfigService],
      // B20: message content (live reset/activation links, recipient
      // address) is never printed in production — dev and test runs keep it,
      // since developers and the integration suites complete reset/activation
      // flows by reading the link from this output.
      useFactory: (
        registry: TemplateRegistry,
        config: ConfigService<Env, true>,
      ): NotificationChannel =>
        new ConsoleNotificationChannel(registry, console.log, {
          revealContent: config.get('NODE_ENV', { infer: true }) !== 'production',
        }),
    },
    OperationalAlertService,
  ],
  exports: [NOTIFICATION_CHANNEL, NOTIFICATION_TEMPLATE_REGISTRY, OperationalAlertService],
})
export class NotificationsModule {}
