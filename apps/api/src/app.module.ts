import { MiddlewareConsumer, Module, ValidationPipe, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module.js';
import { RedisModule } from './redis/redis.module.js';
import { HealthModule } from './health/health.module.js';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware.js';
import { TenancyMiddleware } from './common/tenancy.middleware.js';
import { TenancyModule } from './common/tenancy.module.js';
import { IdempotencyInterceptor } from './common/idempotency.interceptor.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { UuidRouteParamPipe } from './common/uuid-route-param.pipe.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { SecurityModule } from './security/security.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { AccessGateModule } from './modules/platform/access-gate.module.js';
import { AuthorizationModule } from './modules/authorization/authorization.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ImportsModule } from './modules/imports/imports.module.js';
import { QuestionsModule } from './modules/questions/questions.module.js';
import { QuestionReviewModule } from './modules/question-review/question-review.module.js';
import { ExamsModule } from './modules/exams/exams.module.js';
import { ExecutionModule } from './modules/execution/execution.module.js';
import { ResultsModule } from './modules/results/results.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { OperationsModule } from './modules/operations/operations.module.js';
import { NotificationCenterModule } from './modules/notification-center/notification-center.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';

@Module({
  imports: [
    AppConfigModule,
    RedisModule,
    TenancyModule,
    SecurityModule,
    AuthorizationModule,
    NotificationsModule,
    AccessGateModule,
    HealthModule,
    // Bounded domains (08 §5) — all stubbed empty per B0 scope, except
    // Identity (B1) and Authorization (B2, above — cross-cutting, so it's
    // registered alongside Tenancy/Security rather than in this list).
    // MediaModule (B4) doesn't map 1:1 to a single 08 §5 domain either —
    // it's shared upload/validate/sign infrastructure Platform (branding)
    // and, from B8, Questions both consume, the same shape of exception as
    // Identity/Authorization above.
    MediaModule,
    PlatformModule,
    IdentityModule,
    AcademicsModule,
    UsersModule,
    ImportsModule,
    QuestionsModule,
    QuestionReviewModule,
    ExamsModule,
    ExecutionModule,
    ResultsModule,
    AnalyticsModule,
    OperationsModule,
    NotificationCenterModule,
    ReportsModule,
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
    // Registered here for the identical reason as HttpExceptionFilter above
    // — a real gap found via this phase's own pagination integration tests,
    // not by inspection: main.ts's imperative `app.useGlobalPipes(...)` only
    // ever ran for the real bootstrap() path. Any harness booting AppModule
    // directly (every integration test) never validated/transformed a
    // single `@Body()`/`@Query()` DTO at all — invisible until a test
    // actually asserted DTO-level validation/transform behaviour (an
    // invalid `sortBy` value silently reached Prisma's `orderBy` and 500'd
    // instead of 400ing; `@Type(() => Number)` never coerced a query
    // string to a number). main.ts no longer registers this separately —
    // same double-handling risk HttpExceptionFilter's own comment names.
    // B20: route ids are UUIDs, validated globally (see the pipe's comment).
    { provide: APP_PIPE, useClass: UuidRouteParamPipe },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
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
