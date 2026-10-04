/** B22: a pre-cache job that failed every attempt is retried, not ignored. */
import { describe, expect, it, vi } from 'vitest';
import { ExamMediaPrecacheQueueService } from './exam-media-precache-queue.service.js';

function serviceWith(existing: unknown) {
  const service = new ExamMediaPrecacheQueueService({ get: () => 2000 } as never);
  const queue = { getJob: vi.fn().mockResolvedValue(existing), add: vi.fn() };
  (service as unknown as { queue: typeof queue }).queue = queue;
  return { service, queue };
}

const payload = { schoolId: 's1', examId: 'e1' };

describe('ExamMediaPrecacheQueueService.enqueue (B22)', () => {
  it('adds a job when none exists', async () => {
    const { service, queue } = serviceWith(undefined);
    await service.enqueue(payload);
    expect(queue.add).toHaveBeenCalledWith(
      'encrypt',
      payload,
      expect.objectContaining({ jobId: 'precache-s1-e1' }),
    );
  });

  it('retries a job that failed (storage was down) instead of letting add() silently no-op', async () => {
    const failed = {
      getState: vi.fn().mockResolvedValue('failed'),
      finishedOn: Date.now() - 60_000,
      retry: vi.fn(),
    };
    const { service, queue } = serviceWith(failed);
    await service.enqueue(payload);
    expect(failed.retry).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({ resetAttemptsMade: true }),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not retry the same failure on every manifest poll', async () => {
    const failed = {
      getState: vi.fn().mockResolvedValue('failed'),
      finishedOn: Date.now() - 1_000,
      retry: vi.fn(),
    };
    const { service, queue } = serviceWith(failed);
    await service.enqueue(payload);
    expect(failed.retry).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
