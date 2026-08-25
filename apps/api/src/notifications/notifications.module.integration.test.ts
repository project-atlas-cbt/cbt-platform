/**
 * ADR-0019 B0 scope: "NotificationChannel abstraction" — proves it's
 * actually wired into the real application's DI graph, not just correct
 * in isolation (packages/notifications has its own unit tests for the
 * template pipeline and console channel themselves).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { NotificationChannel, TemplateRegistry } from '@atlas/notifications';
import { AppModule } from '../app.module.js';
import { NOTIFICATION_CHANNEL, NOTIFICATION_TEMPLATE_REGISTRY } from './notifications.module.js';

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('NotificationsModule (ADR-0019)', () => {
  it('resolves a NotificationChannel from the application DI graph', () => {
    const channel = app.get<NotificationChannel>(NOTIFICATION_CHANNEL);
    expect(channel).toBeDefined();
    expect(typeof channel.send).toBe('function');
  });

  it('shares one TemplateRegistry that a real send() call renders against', async () => {
    const registry = app.get<TemplateRegistry>(NOTIFICATION_TEMPLATE_REGISTRY);
    registry.register({
      name: 'notifications-module-integration-probe',
      subject: 'Probe',
      text: 'Hello {{name}}',
    });

    const channel = app.get<NotificationChannel>(NOTIFICATION_CHANNEL);
    // ConsoleNotificationChannel resolves once the template renders
    // without throwing — proving the registry app.get() handed back is
    // the same instance the channel was constructed with.
    await expect(
      channel.send({
        to: 'test@example.test',
        template: 'notifications-module-integration-probe',
        variables: { name: 'Ada' },
      }),
    ).resolves.toBeUndefined();
  });
});
