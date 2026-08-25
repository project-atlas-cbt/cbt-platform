import { Worker, type ConnectionOptions, type Job } from 'bullmq';

export const PROBE_QUEUE_NAME = 'atlas-b0-probe';

export interface ProbeJobData {
  n: number;
}

/**
 * B0 scope: "BullMQ wired with one no-op queue proving enqueue → process →
 * complete, retry, and failure handling." This is that queue's processor —
 * deliberately trivial (doubles a number) since B0 has no domain jobs yet.
 * The first real job lands with whichever phase needs one (B1 password
 * reset dispatch, B13 auto-submission sweeper, etc.).
 */
export function createProbeWorker(connection: ConnectionOptions): Worker<ProbeJobData> {
  return new Worker<ProbeJobData>(
    PROBE_QUEUE_NAME,
    // Not `async` — the body is synchronous, and an async function with no
    // `await` trips @typescript-eslint/require-await. BullMQ's processor
    // type wants a Promise back, so we wrap the value instead.
    (job: Job<ProbeJobData>) => Promise.resolve({ doubled: job.data.n * 2 }),
    { connection },
  );
}
