import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ObjectStorageService } from '../../storage/object-storage.service.js';
import { purgeExpiredImportSources } from './import-source-purge.js';

const HOURLY = 60 * 60 * 1000;

/**
 * B22 (decision 6A): runs the `import-source-files` retention rule hourly
 * in each API process (see import-source-purge.ts). Concurrent passes in two
 * processes are harmless: a delete of an already-deleted key succeeds and
 * the `source_purged_at` update only touches rows still null.
 */
@Injectable()
export class ImportSourcePurgeService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ImportSourcePurgeService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly storage: ObjectStorageService) {}

  onModuleInit(): void {
    if (process.env.ATLAS_OPENAPI_EMIT === 'true') return;
    this.timer = setInterval(() => void this.runOnce(), HOURLY);
    this.timer.unref();
  }

  async runOnce(): Promise<void> {
    try {
      const { purged, schoolsFailed } = await purgeExpiredImportSources(this.storage);
      if (purged > 0 || schoolsFailed > 0) {
        this.logger.log({ msg: 'Import source files purged', purged, schoolsFailed });
      }
    } catch (error) {
      this.logger.error({
        msg: 'Import source purge failed',
        err: error instanceof Error ? `${error.name}: ${error.message}` : 'non-Error value',
      });
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
