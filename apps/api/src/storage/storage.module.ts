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
      useFactory: createS3Client,
    },
    ObjectStorageService,
  ],
  exports: [ObjectStorageService],
})
export class StorageModule {}

/** The S3 client every storage user shares. Exported for the operator
 * CLIs (B22), which run without the Nest app — see `createObjectStorage`. */
export function createS3Client(config: ConfigService<Env, true>): S3Client {
  const endpoint = config.get('S3_ENDPOINT', { infer: true });
  const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
  const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });
  // exactOptionalPropertyTypes forbids `endpoint: undefined` — omit
  // the key entirely rather than passing it explicitly-empty.
  return new S3Client({
    ...(endpoint ? { endpoint } : {}),
    region: config.get('S3_REGION', { infer: true }),
    // B23: on ECS no static keys are configured — the SDK's default chain
    // picks up the task role's short-lived credentials instead.
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    systemClockOffset: config.get('S3_SYSTEM_CLOCK_OFFSET_MS', { infer: true }),
    // Path-style for MinIO/s3rver (local, CI); virtual-hosted on AWS so
    // presigned media URLs carry the bucket's own origin (CSP/CORS).
    forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
    // B22 (08 §25): without these a storage endpoint that stops
    // answering held each call for the OS TCP timeout (minutes) per
    // SDK attempt. Every call now fails within a bounded time, and the
    // caller keeps its retry state.
    maxAttempts: config.get('S3_MAX_ATTEMPTS', { infer: true }),
    requestHandler: {
      connectionTimeout: config.get('S3_CONNECT_TIMEOUT_MS', { infer: true }),
      requestTimeout: config.get('S3_REQUEST_TIMEOUT_MS', { infer: true }),
      throwOnRequestTimeout: true,
    },
  });
}

/** B22: an `ObjectStorageService` for a standalone operator command
 * (ops:redact-subject deletes import source files), built from the same
 * validated environment the API boots with. */
export function createObjectStorage(env: Env): ObjectStorageService {
  const config = new ConfigService<Env, true>(env);
  return new ObjectStorageService(createS3Client(config), config);
}
