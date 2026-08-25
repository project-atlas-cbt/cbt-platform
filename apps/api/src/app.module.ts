import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module.js';
import { RedisModule } from './redis/redis.module.js';
import { HealthModule } from './health/health.module.js';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware.js';
import { TenancyMiddleware } from './common/tenancy.middleware.js';
import { TenancyModule } from './common/tenancy.module.js';
import { IdempotencyInterceptor } from './common/idempotency.interceptor.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { SecurityModule } from './security/security.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
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
    NotificationsModule,
    HealthModule,
    // Bounded domains (08 §5) — all stubbed empty per B0 scope.
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
