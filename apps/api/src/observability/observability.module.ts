import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ExamHealthService } from './exam-health.service.js';
import { RequestLoggingInterceptor } from './request-logging.interceptor.js';

@Global()
@Module({
  providers: [ExamHealthService, { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor }],
  exports: [ExamHealthService],
})
export class ObservabilityModule {}
