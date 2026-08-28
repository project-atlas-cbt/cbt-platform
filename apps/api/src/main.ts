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
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  // A real bug found only by live browser testing of F3's admin login, not
  // by inspection: @fastify/helmet's default `hsts` option was on
  // unconditionally, in every environment. Local/CI dev never terminates
  // TLS (native dev and Docker Compose both serve plain HTTP) — sending
  // Strict-Transport-Security there is actively harmful, not just
  // redundant: a browser that ever receives it caches "always upgrade this
  // host, and — because of `includeSubDomains` — every `*.<root>`
  // subdomain, to HTTPS" for up to a year. Every subsequent plain-HTTP dev
  // request then fails at the TLS handshake itself
  // (net::ERR_ALPN_NEGOTIATION_FAILED) until the browser's cached policy is
  // manually cleared (chrome://net-internals/#hsts). Disabled outside
  // production, mirroring `allowInsecureSubdomains`' own "only relaxed
  // outside production" reasoning immediately below.
  await app.register(helmet, { global: true, hsts: isProduction });
  // Read into variables first, not inline: inside the object literal below,
  // @fastify/cors's wide `origin` union type appears to push the ConfigService
  // generic overload toward `unknown` instead of inferring `string` from Env.
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });
  const rootDomain = config.get('PLATFORM_ROOT_DOMAIN', { infer: true });
  // F1: real per-school subdomain browser testing in local dev
  // (greenfield.localtest.me:3000, apps/web/lib/api/resolve-origin.ts) has
  // no TLS to offer — only ever relaxed outside production; see
  // isAllowedOrigin's own doc comment.
  const allowInsecureSubdomains = !isProduction;
  await app.register(cors, {
    // ADR-0022's topology is multi-origin — every school's
    // `<subdomain>.<root>` plus `admin.<root>` — so a single static
    // origin string can't express it. See security/cors.ts.
    origin: (origin, cb) => {
      cb(null, isAllowedOrigin(origin, webOrigin, rootDomain, allowInsecureSubdomains));
    },
    credentials: true, // same-site HttpOnly cookies per ADR-0022
    // A real bug found only by live cross-origin browser testing of F4's
    // onboarding wizard (its first PUT/PATCH calls), not by inspection or
    // any integration test — every prior phase's automated suite drives the
    // app via `app.inject()`, which bypasses CORS entirely, so nothing had
    // ever exercised this preflight path for a non-GET/POST method before.
    // @fastify/cors's own default `methods` is the literal string
    // `'GET,HEAD,POST'` (see its `defaultOptions`) — with no explicit
    // `methods` here, every PUT/PATCH/DELETE route in the API has been
    // silently CORS-blocked for real cross-origin browser callers since
    // B0's original CORS registration. This app has PUT/PATCH/DELETE routes
    // throughout (school/branding updates, academics CRUD, people
    // management, onboarding, ...), so the full method set is listed
    // explicitly rather than guessed narrowly per caller.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
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
