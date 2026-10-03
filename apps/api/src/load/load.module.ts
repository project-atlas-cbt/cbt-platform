import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RedisModule } from '../redis/redis.module.js';
import { LoadMonitorService } from './load-monitor.service.js';
import { LoadSheddingGuard } from './load-shedding.guard.js';
import { InFlightMiddleware } from './load-shedding.middleware.js';

/** B21 (R-12): saturation monitoring and priority load shedding. Imported
 * first in AppModule so its APP_GUARD runs before every other guard. */
@Global()
@Module({
  imports: [RedisModule],
  providers: [
    LoadMonitorService,
    InFlightMiddleware,
    { provide: APP_GUARD, useClass: LoadSheddingGuard },
  ],
  exports: [LoadMonitorService, InFlightMiddleware],
})
export class LoadModule {}
