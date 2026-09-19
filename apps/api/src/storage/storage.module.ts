import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import type { Env } from '@atlas/config';
import { ObjectStorageService } from './object-storage.service.js';
import { S3_CLIENT } from './storage.tokens.js';

export { S3_CLIENT };

/**
 * B4 (09 §22-23): tenant-isolated object storage, abstracted behind
 * ObjectStorageService (09 §23: "The application should abstract object
 * storage behind ObjectStorageService so switching later doesn't
 * contaminate the domain code") rather than a raw S3Client leaking into
 * every consumer. Mirrors RedisModule's own shape exactly (@Global(), one
 * symbol-keyed client provider, a ConfigService-injected factory).
 *
 * `forcePathStyle: true` is required for MinIO (local/CI) and harmless
 * against real AWS S3 — both are addressed through the same client via
 * S3_ENDPOINT/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY, which B0
 * already stubbed in packages/config/src/env.schema.ts naming this phase
 * as the one that wires them up.
 */
@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const endpoint = config.get('S3_ENDPOINT', { infer: true });
        // exactOptionalPropertyTypes forbids `endpoint: undefined` — omit
        // the key entirely rather than passing it explicitly-empty.
        return new S3Client({
          ...(endpoint ? { endpoint } : {}),
          region: config.get('S3_REGION', { infer: true }),
          credentials: {
            accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
            secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
          },
          systemClockOffset: config.get('S3_SYSTEM_CLOCK_OFFSET_MS', { infer: true }),
          forcePathStyle: true,
        });
      },
    },
    ObjectStorageService,
  ],
  exports: [ObjectStorageService],
})
export class StorageModule {}
