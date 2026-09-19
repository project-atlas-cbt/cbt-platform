import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { ReportsController } from './reports.controller.js';
import { ExportQueueService } from './export-queue.service.js';
import { ExportService } from './export.service.js';
import { ExportWorkerService } from './export-worker.service.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';
import { PrintDataController } from './print-data.controller.js';
import { ReportsAuditActionRegistrationProvider } from './audit-action-registration.provider.js';
import { ResultsModule } from '../results/results.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';

@Module({
  imports: [IdentityModule, OperationsModule, ResultsModule, AnalyticsModule],
  controllers: [ReportsController, SearchController, PrintDataController],
  providers: [
    ExportQueueService,
    ExportService,
    ExportWorkerService,
    SearchService,
    ReportsAuditActionRegistrationProvider,
  ],
  exports: [ExportService],
})
export class ReportsModule {}
