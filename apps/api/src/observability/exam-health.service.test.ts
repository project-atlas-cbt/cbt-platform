import { describe, expect, it, vi } from 'vitest';
import { ExamHealthService } from './exam-health.service.js';

function config(values: Record<string, number>) {
  return {
    get(key: string) {
      return values[key];
    },
  };
}

describe('ExamHealthService', () => {
  it('raises one deduplicated alert under simulated answer-save degradation', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const pipeline = {
      hmget: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, ['40', '10']],
        [null, ['0', '0']],
      ]),
    };
    const redis = {
      pipeline: () => pipeline,
      set,
    };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new ExamHealthService(
      redis as never,
      config({
        EXAM_HEALTH_WINDOW_SECONDS: 120,
        EXAM_HEALTH_MIN_SAMPLES: 50,
        EXAM_HEALTH_SUCCESS_THRESHOLD_PERCENT: 95,
        EXAM_HEALTH_ALERT_COOLDOWN_SECONDS: 900,
      }) as never,
    );

    const result = await service.evaluateAnswerSaveHealth('school-1');

    expect(result).toEqual({ total: 50, successRate: 80, alerted: true });
    expect(set).toHaveBeenCalledWith(
      'atlas:exam-health:answer-save-alert:school-1',
      expect.any(String),
      'EX',
      900,
      'NX',
    );
    expect(errorLog).toHaveBeenCalledOnce();
    errorLog.mockRestore();
  });

  it('does not alert below the minimum sample size', async () => {
    const redis = {
      pipeline: () => ({
        hmget: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[null, ['1', '1']]]),
      }),
      set: vi.fn(),
    };
    const service = new ExamHealthService(
      redis as never,
      config({
        EXAM_HEALTH_WINDOW_SECONDS: 60,
        EXAM_HEALTH_MIN_SAMPLES: 50,
        EXAM_HEALTH_SUCCESS_THRESHOLD_PERCENT: 95,
        EXAM_HEALTH_ALERT_COOLDOWN_SECONDS: 900,
      }) as never,
    );

    expect(await service.evaluateAnswerSaveHealth('school-1')).toEqual({
      total: 2,
      successRate: 50,
      alerted: false,
    });
    expect(redis.set).not.toHaveBeenCalled();
  });
});
