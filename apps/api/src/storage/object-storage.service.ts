import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3ServiceException,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '@atlas/config';
import { S3_CLIENT } from './storage.tokens.js';

export interface UploadTarget {
  uploadUrl: string;
  expiresAt: Date;
}

export interface SignedDownload {
  url: string;
  expiresAt: Date;
}

/** Ranged-GET default: enough bytes for file-type's magic-byte sniffing and
 * image-size's dimension parsing without downloading a whole multi-MB file. */
const DEFAULT_PREFIX_BYTES = 4100;

/**
 * The seam `MediaService` actually depends on (09 §23: "abstract object
 * storage behind ObjectStorageService so switching later doesn't
 * contaminate the domain code") — built on the official AWS SDK v3
 * (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`), which works
 * identically against real AWS S3 and any S3-compatible service (MinIO,
 * via StorageModule's `forcePathStyle`).
 */
@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly bucket: string;

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.bucket = this.config.get('S3_BUCKET', { infer: true });
  }

  /**
   * Idempotent create-bucket-if-missing, run once at boot. This is how
   * bucket provisioning works identically in CI service containers, which
   * (per B0's own precedent — GitHub Actions `services:` containers can't
   * run custom init scripts) can't be handed a docker-compose-level init
   * step the way local MinIO gets one. Against real AWS S3, the bucket is
   * provisioned by B23's infra/IaC ahead of time — HeadBucket already
   * succeeding makes this a no-op there.
   */
  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      if (!this.isNotFound(error)) {
        // Anything other than "doesn't exist" (auth failure, network) should
        // surface loudly rather than be swallowed by a blind CreateBucket
        // attempt that would just fail the same way.
        throw error;
      }
    }

    try {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created object storage bucket "${this.bucket}".`);
    } catch (error) {
      // Two concurrent boots (api + worker) racing to create the same
      // bucket is expected, not an error.
      const code = this.errorCode(error);
      if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
        throw error;
      }
    }
  }

  /**
   * Presigned PUT with Content-Length pinned to the declared size, so the
   * upload's size is enforced at the storage layer itself without proxying
   * bytes through Nest.
   */
  async createUploadTarget(params: {
    storageKey: string;
    contentType: string;
    contentLength: number;
    ttlSeconds: number;
  }): Promise<UploadTarget> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.storageKey,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: params.ttlSeconds });
    return { uploadUrl, expiresAt: new Date(Date.now() + params.ttlSeconds * 1000) };
  }

  /** Confirms an upload actually landed before `MediaService` validates it. */
  async headObject(storageKey: string): Promise<{ sizeBytes: number } | null> {
    try {
      const result = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return { sizeBytes: result.ContentLength ?? 0 };
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  /**
   * Ranged GET of the object's first bytes — for magic-byte sniffing and
   * dimension extraction without downloading the whole object.
   */
  async getObjectPrefix(storageKey: string, byteLength = DEFAULT_PREFIX_BYTES): Promise<Buffer> {
    const result = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Range: `bytes=0-${byteLength - 1}`,
      }),
    );
    const body = result.Body;
    if (!body) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    // @aws-sdk/client-s3's Body is a Node.js Readable in this runtime.
    for await (const chunk of body as unknown as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Full-object download — B7's import validation job needs the entire
   * file to parse (a multi-thousand-row CSV/XLSX), unlike `getObjectPrefix`
   * above, which is deliberately capped for magic-byte sniffing/dimension
   * extraction. `CONTENT_LIMITS.IMPORT_SOURCE.maxSizeBytes` (5MB) bounds
   * what this will ever be asked to buffer in memory — small enough that a
   * streaming read isn't warranted.
   */
  async getObject(storageKey: string): Promise<Buffer> {
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    const body = result.Body;
    if (!body) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    for await (const chunk of body as unknown as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Presigned GET. TTL is the caller's decision — 15 min for question
   * media via `GET /v1/media/:id/url`, a longer TTL for the logo URL
   * embedded in the public `GET /v1/tenant/resolve` (ADR-0021: "logo may
   * be cacheable").
   */
  async createSignedDownloadUrl(storageKey: string, ttlSeconds: number): Promise<SignedDownload> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    const url = await getSignedUrl(this.s3, command, { expiresIn: ttlSeconds });
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  private isNotFound(error: unknown): boolean {
    if (error instanceof S3ServiceException) {
      return error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound';
    }
    return false;
  }

  private errorCode(error: unknown): string | undefined {
    return error instanceof S3ServiceException ? error.name : undefined;
  }
}
