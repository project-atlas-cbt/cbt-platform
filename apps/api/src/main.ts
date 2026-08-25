import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import type { Env } from '@atlas/config';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { API_VERSION_PREFIX } from './openapi/version.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  const config = app.get(ConfigService<Env, true>);

  await app.register(helmet, { global: true });
  // Read into a variable first, not inline: inside the object literal below,
  // @fastify/cors's wide `origin` union type appears to push the ConfigService
  // generic overload toward `unknown` instead of inferring `string` from Env.
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });
  await app.register(cors, {
    origin: webOrigin,
    credentials: true, // same-site HttpOnly cookies per ADR-0022
  });

  app.setGlobalPrefix(API_VERSION_PREFIX.replace(/^\//, ''));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get('API_PORT', { infer: true });
  const host = config.get('API_HOST', { infer: true });
  await app.listen(port, host);
  console.log(`[api] listening on http://${host}:${port}${API_VERSION_PREFIX}`);
}

bootstrap().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
