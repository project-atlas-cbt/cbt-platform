import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import type { Env } from '@atlas/config';
import { AppModule } from './app.module.js';
import { API_VERSION_PREFIX } from './openapi/version.js';
import { isAllowedOrigin } from './security/cors.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  const config = app.get(ConfigService<Env, true>);

  await app.register(helmet, { global: true });
  // Read into variables first, not inline: inside the object literal below,
  // @fastify/cors's wide `origin` union type appears to push the ConfigService
  // generic overload toward `unknown` instead of inferring `string` from Env.
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });
  const rootDomain = config.get('PLATFORM_ROOT_DOMAIN', { infer: true });
  // F1: real per-school subdomain browser testing in local dev
  // (greenfield.localtest.me:3000, apps/web/lib/api/resolve-origin.ts) has
  // no TLS to offer — only ever relaxed outside production; see
  // isAllowedOrigin's own doc comment.
  const allowInsecureSubdomains = config.get('NODE_ENV', { infer: true }) !== 'production';
  await app.register(cors, {
    // ADR-0022's topology is multi-origin — every school's
    // `<subdomain>.<root>` plus `admin.<root>` — so a single static
    // origin string can't express it. See security/cors.ts.
    origin: (origin, cb) => {
      cb(null, isAllowedOrigin(origin, webOrigin, rootDomain, allowInsecureSubdomains));
    },
    credentials: true, // same-site HttpOnly cookies per ADR-0022
  });

  app.setGlobalPrefix(API_VERSION_PREFIX.replace(/^\//, ''));
  // HttpExceptionFilter and ValidationPipe are both registered as
  // APP_FILTER/APP_PIPE in app.module.ts — not here — so they apply to any
  // harness that boots AppModule, not just this real bootstrap() path. See
  // those providers' own comments (the ValidationPipe one records a real
  // bug this exact gap caused, found via F3's pagination gap-closure).

  const port = config.get('API_PORT', { infer: true });
  const host = config.get('API_HOST', { infer: true });
  await app.listen(port, host);
  console.log(`[api] listening on http://${host}:${port}${API_VERSION_PREFIX}`);
}

bootstrap().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
