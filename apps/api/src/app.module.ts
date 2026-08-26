import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module.js';
import { RedisModule } from './redis/redis.module.js';
import { HealthModule } from './health/health.module.js';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware.js';
import { TenancyMiddleware } from './common/tenancy.middleware.js';
import { TenancyModule } from './common/tenancy.module.js';
import { IdempotencyInterceptor } from './common/idempotency.interceptor.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { SecurityModule } from './security/security.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { AuthorizationModule } from './modules/authorization/authorization.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { QuestionsModule } from './modules/questions/questions.module.js';
import { ExamsModule } from './modules/exams/exams.module.js';
import { ExecutionModule } from './modules/execution/execution.module.js';
import { ResultsModule } from './modules/results/results.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { OperationsModule } from './modules/operations/operations.module.js';

@Module({
  imports: [
    AppConfigModule,
    RedisModule,
    TenancyModule,
    SecurityModule,
    AuthorizationModule,
    NotificationsModule,
    HealthModule,
    // Bounded domains (08 §5) — all stubbed empty per B0 scope, except
    // Identity (B1) and Authorization (B2, above — cross-cutting, so it's
    // registered alongside Tenancy/Security rather than in this list).
    PlatformModule,
    IdentityModule,
    AcademicsModule,
    QuestionsModule,
    ExamsModule,
    ExecutionModule,
    ResultsModule,
    AnalyticsModule,
    OperationsModule,
  ],
  providers: [
    // Global per ADR-0033: every mutating endpoint honours Idempotency-Key
    // for free, from B1 onward, without each controller wiring it by hand.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    // Registered here (not just imperatively in main.ts's bootstrap()) so
    // the ADR-0033 envelope applies consistently to *any* harness that
    // boots AppModule — including every integration test that calls
    // NestFactory.create(AppModule) directly and never runs main.ts.
    // B1's identity.integration.test.ts is what surfaced the gap: guard-
    // thrown AppHttpExceptions (e.g. AuthGuard's UNAUTHENTICATED) were
    // reaching Nest's default handler instead of this filter, so
    // integration-tested error paths were silently getting a bare 500
    // instead of the real envelope. main.ts no longer registers this
    // separately — doing it in both places would double-handle every
    // exception (the filter itself calls res.send(), so a second
    // invocation would crash trying to send an already-sent response).
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // CsrfGuard (SecurityModule, bound via APP_GUARD) reads
    // TenancyContextService.schoolId — middleware always runs before
    // guards in Nest's pipeline, so ordering is automatic, not something
    // this chain needs to express.
    consumer.apply(CorrelationIdMiddleware, TenancyMiddleware).forRoutes('*');
  }
}
