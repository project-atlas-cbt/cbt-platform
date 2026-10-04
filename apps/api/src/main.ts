import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { getProductName, loadEnv, loadRootEnv, type Env } from '@atlas/config';
import {
  createLogger,
  flushSentry,
  initMetrics,
  initSentry,
  initTelemetry,
  shutdownMetrics,
  shutdownTelemetry,
} from '@atlas/observability';
import { PinoNestLogger } from './common/logging/pino-nest-logger.js';
import { markDraining } from './common/lifecycle.js';
import { AppModule } from './app.module.js';
import { API_VERSION_PREFIX } from './openapi/version.js';
import { registerHttpSecurity } from './security/http-security.js';
import { startImportWorkers } from './modules/imports/import-worker-bootstrap.js';
import { startNotificationDispatchWorker } from './modules/notification-center/notification-dispatch-worker-bootstrap.js';
import { buildOpenApiConfig } from './openapi/document.js';
import { injectSharedComponents } from './openapi/shared-components.js';
import { ErrorEnvelopeDto } from './common/error-envelope.dto.js';

async function bootstrap() {
  // B20 (08 §18, 09 §35): telemetry, error tracking and the structured
  // logger come up before the application, from the same validated env the
  // app itself will use (loadEnv fails fast on anything malformed).
  loadRootEnv();
  const env = loadEnv();
  initTelemetry({ serviceName: 'atlas-api', otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT });
  initMetrics({ serviceName: 'atlas-api', otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT });
  initSentry({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    serviceName: 'atlas-api',
    release: env.RELEASE_VERSION,
  });
  const logger = createLogger({ service: 'api', level: env.LOG_LEVEL });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // B20: the real client IP behind the load balancer (TRUST_PROXY_HOPS,
    // 0 locally). Rate limiting and session ip_address both read req.ip.
    // Trust function form: the first TRUST_PROXY_HOPS proxies (counted
    // from the socket) are trusted, nothing beyond them.
    new FastifyAdapter({
      // B21 (R-04): keep-alive must outlive the load balancer's idle
      // timeout (ALB default 60 s; set in B23) or the ALB reuses a socket the
      // API has just closed and the client sees a 502. requestTimeout bounds
      // how long a client may take to *send* a request (a slow-loris guard);
      // it does not limit long-lived SSE responses. Both measured in B21 —
      // docs/performance/capacity-plan.md.
      keepAliveTimeout: 65_000,
      requestTimeout: 30_000,
      trustProxy:
        env.TRUST_PROXY_HOPS > 0
          ? (_address: string, hop: number) => hop < env.TRUST_PROXY_HOPS
          : false,
    }),
    { bufferLogs: true },
  );
  app.useLogger(new PinoNestLogger(logger));

  const config = app.get(ConfigService<Env, true>);
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  // B20: helmet (restrictive API CSP, HSTS in production only — see
  // http-security.ts for the F3 dev-HSTS history) and the CORS lockdown,
  // shared with the security suite so it tests exactly this posture.
  await registerHttpSecurity(app, {
    isProduction,
    webOrigin: config.get('WEB_ORIGIN', { infer: true }),
    rootDomain: config.get('PLATFORM_ROOT_DOMAIN', { infer: true }),
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
  logger.info({ port, host }, `API listening on ${API_VERSION_PREFIX}`);
  if (!isProduction) {
    logger.info(`API docs available at http://${host}:${port}/docs`);
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
  // B22: one ordered, bounded shutdown (it used to race Nest's own
  // shutdown hooks and could exit before in-flight requests finished).
  // 1. readiness turns 503 so the load balancer stops routing here;
  // 2. background consumers stop taking jobs (active ones finish);
  // 3. app.close() ends SSE streams, then lets Fastify finish in-flight
  //    requests, then closes queues and connections;
  // 4. telemetry flushes. SHUTDOWN_TIMEOUT_MS bounds the whole sequence —
  //    past it the process exits anyway and BullMQ redelivers any job it
  //    held, so nothing is lost, only delayed.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    markDraining();
    logger.info({ signal }, 'Shutting down: draining in-flight requests');
    const timeoutMs = config.get('SHUTDOWN_TIMEOUT_MS', { infer: true });
    setTimeout(() => {
      logger.error({ timeoutMs }, 'Shutdown timed out; exiting');
      process.exit(1);
    }, timeoutMs).unref();
    void Promise.all([importWorkers.close(), notificationDispatchWorker.close()])
      .catch((err: unknown) => logger.error({ err }, 'Error closing background workers'))
      .then(() => app.close())
      .catch((err: unknown) => logger.error({ err }, 'Error closing the application'))
      .then(() => Promise.all([shutdownTelemetry(), shutdownMetrics(), flushSentry()]))
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err: unknown) => {
  // The structured logger may not exist yet (env validation failed) — a
  // plain stderr line is the only reliable channel here; EnvValidationError
  // lists variable names, never values.
  console.error('[api] failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
