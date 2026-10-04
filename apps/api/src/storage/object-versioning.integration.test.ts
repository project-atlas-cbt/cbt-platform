/**
 * B22 DoD (object storage backup): with bucket versioning on — what
 * `S3_ENSURE_VERSIONING` turns on, and what the B23 bucket configuration
 * must keep on — an overwritten or deleted object is recoverable for the
 * noncurrent-version window (35 days, retention schedule). This proves the
 * object-version recovery runbook's steps against a real S3 implementation
 * (MinIO in CI). Skipped where the storage backend has no versioning (the
 * s3rver stand-in some local setups use).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { loadRootEnv } from '@atlas/config';

loadRootEnv();

const s3 = new S3Client({
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
  region: process.env.S3_REGION ?? 'eu-west-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
  forcePathStyle: true,
});
const bucket = `atlas-b22-versioning-${randomUUID().slice(0, 8)}`;
const key = 'schools/s1/questions/a1/diagram.png';
let supported = false;

async function body(versionId?: string): Promise<string> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, ...(versionId && { VersionId: versionId }) }),
  );
  return res.Body!.transformToString();
}

beforeAll(async () => {
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  await s3
    .send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: 'Enabled' },
      }),
    )
    .catch(() => undefined);
  const status = await s3
    .send(new GetBucketVersioningCommand({ Bucket: bucket }))
    .catch(() => null);
  supported = status?.Status === 'Enabled';
});

afterAll(async () => {
  const versions = await s3
    .send(new ListObjectVersionsCommand({ Bucket: bucket }))
    .catch(() => null);
  const objects = [...(versions?.Versions ?? []), ...(versions?.DeleteMarkers ?? [])].map((v) => ({
    Key: v.Key!,
    VersionId: v.VersionId!,
  }));
  if (objects.length > 0) {
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
  }
  await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
});

describe('object versioning recovery (B22)', () => {
  it('recovers an object after it was overwritten and then deleted', async (ctx) => {
    if (!supported) ctx.skip();

    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'original' }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'overwritten' }));
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    await expect(body()).rejects.toThrow();

    // Runbook step 1: list the key's versions; the delete left a marker,
    // both earlier versions are still there.
    const listed = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key }));
    expect(listed.DeleteMarkers?.length).toBe(1);
    const versions = (listed.Versions ?? []).sort(
      (a, b) => a.LastModified!.getTime() - b.LastModified!.getTime(),
    );
    expect(versions.length).toBe(2);
    const original = versions[0]!.VersionId!;
    expect(await body(original)).toBe('original');

    // Runbook step 2: copy the chosen version over the current key. This
    // never deletes a version (the app role has no DeleteObjectVersion).
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: `${bucket}/${encodeURIComponent(key)}?versionId=${original}`,
      }),
    );
    expect(await body()).toBe('original');
  });
});
