import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { getProductName, type Env } from '@atlas/config';
import {
  initializeObservability,
  shutdownObservability,
  structuredLog,
} from '@atlas/observability';
import { AppModule } from './app.module.js';
import { API_VERSION_PREFIX } from './openapi/version.js';
import { isAllowedOrigin } from './security/cors.js';
import { startImportWorkers } from './modules/imports/import-worker-bootstrap.js';
import { startNotificationDispatchWorker } from './modules/notification-center/notification-dispatch-worker-bootstrap.js';
import { buildOpenApiConfig } from './openapi/document.js';
import { injectSharedComponents } from './openapi/shared-components.js';
import { ErrorEnvelopeDto } from './common/error-envelope.dto.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  const config = app.get(ConfigService<Env, true>);
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  initializeObservability({
    serviceName: 'atlas-api',
    environment: config.get('OBSERVABILITY_ENVIRONMENT', { infer: true }),
    ...(config.get('OTEL_EXPORTER_OTLP_ENDPOINT', { infer: true })
      ? { otlpEndpoint: config.get('OTEL_EXPORTER_OTLP_ENDPOINT', { infer: true }) }
      : {}),
    ...(config.get('SENTRY_DSN', { infer: true })
      ? { sentryDsn: config.get('SENTRY_DSN', { infer: true }) }
      : {}),
  });

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

  // Interactive API docs (Swagger UI), mounted at /docs — there was
  // previously no live, browsable way to see the API's endpoints at all:
  // `pnpm generate` (openapi/emit.ts) only ever wrote a committed
  // apps/api/openapi.json for @atlas/contracts to generate types from,
  // never a route this running process itself served. Reuses that exact
  // same document-building path (buildOpenApiConfig + injectSharedComponents
  // + ErrorEnvelopeDto as an extra model) rather than a second one that
  // could drift — only the destination differs (a live UI here, a file
  // there). `SwaggerModule.setup()` registers its own routes directly on
  // the underlying Fastify instance, not through Nest's controller
  // routing, so `app.setGlobalPrefix()` above doesn't affect where it
  // lands either way. Outside production only, mirroring `hsts`/
  // `allowInsecureSubdomains`'s own "differs by environment" posture in
  // this same file: the document lists every endpoint, DTO shape, and — via
  // each operation's summary — the permission id it enforces, which is a
  // real information-disclosure surface to leave open on a live,
  // publicly-reachable multi-tenant commercial deployment.
  if (!isProduction) {
    const productName = getProductName({
      PRODUCT_NAME: config.get('PRODUCT_NAME', { infer: true }),
    });
    const openApiDocument = SwaggerModule.createDocument(app, buildOpenApiConfig(productName), {
      extraModels: [ErrorEnvelopeDto],
    });
    injectSharedComponents(openApiDocument);
    SwaggerModule.setup('docs', app, openApiDocument);
  }

  const port = config.get('API_PORT', { infer: true });
  const host = config.get('API_HOST', { infer: true });
  await app.listen(port, host);
  structuredLog('info', 'api.started', { host, port, apiPrefix: API_VERSION_PREFIX });
  if (!isProduction) {
    structuredLog('info', 'api.docs.enabled', { route: '/docs' });
  }

  // B7: the two import BullMQ Worker consumers, started only here — never
  // via Nest's module lifecycle — so no integration test that boots
  // AppModule directly (this codebase's established pattern) ever gets a
  // live consumer running against the shared local Redis. See
  // ImportQueueService's own doc comment for the full reasoning.
  const importWorkers = startImportWorkers(app);
  // B10: the notification out-of-band dispatch retry consumer — same
  // "only from here, never via Nest's module lifecycle" reasoning as the
  // import workers above. See NotificationDispatchQueueService's own doc
  // comment.
  const notificationDispatchWorker = startNotificationDispatchWorker(app);
  app.enableShutdownHooks();
  const shutdown = () => {
    void Promise.all([importWorkers.close(), notificationDispatchWorker.close()])
      .then(() => shutdownObservability())
      .catch((err: unknown) => structuredLog('error', 'api.shutdown.failed', {}, err))
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  structuredLog('error', 'api.start.failed', {}, err);
  process.exit(1);
});
