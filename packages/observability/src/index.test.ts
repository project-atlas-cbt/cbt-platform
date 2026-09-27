import { describe, expect, it, vi } from 'vitest';
import { structuredLog } from './index.js';

describe('structuredLog', () => {
  it('emits JSON and drops sensitive fields', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    structuredLog('info', 'request.completed', {
      correlationId: 'corr-1',
      schoolId: 'school-1',
      answerContent: 'must-not-leak',
      password: 'must-not-leak',
      durationMs: 12,
    });

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload).toMatchObject({
      level: 'info',
      event: 'request.completed',
      correlationId: 'corr-1',
      schoolId: 'school-1',
      durationMs: 12,
    });
    expect(payload).not.toHaveProperty('answerContent');
    expect(payload).not.toHaveProperty('password');
    log.mockRestore();
  });
});
