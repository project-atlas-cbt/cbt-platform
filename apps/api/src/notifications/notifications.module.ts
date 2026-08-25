import { Global, Module } from '@nestjs/common';
import {
  ConsoleNotificationChannel,
  TemplateRegistry,
  type NotificationChannel,
} from '@atlas/notifications';

export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');
export const NOTIFICATION_TEMPLATE_REGISTRY = Symbol('NOTIFICATION_TEMPLATE_REGISTRY');

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
    { provide: NOTIFICATION_TEMPLATE_REGISTRY, useValue: new TemplateRegistry() },
    {
      provide: NOTIFICATION_CHANNEL,
      inject: [NOTIFICATION_TEMPLATE_REGISTRY],
      useFactory: (registry: TemplateRegistry): NotificationChannel =>
        new ConsoleNotificationChannel(registry),
    },
  ],
  exports: [NOTIFICATION_CHANNEL, NOTIFICATION_TEMPLATE_REGISTRY],
})
export class NotificationsModule {}
