import { describe, expect, it, vi } from 'vitest';
import { AnalyticsCacheService } from './analytics-cache.service.js';

describe('AnalyticsCacheService', () => {
  it('keys entries by tenant and audience and rebuilds after invalidation', async () => {
    const values = new Map<string, string>();
    const redis = {
      get: vi.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
      set: vi.fn((key: string, value: string) => {
        values.set(key, value);
        return Promise.resolve('OK');
      }),
      incr: vi.fn((key: string) => {
        const value = String(Number(values.get(key) ?? '0') + 1);
        values.set(key, value);
        return Promise.resolve(Number(value));
      }),
      del: vi.fn((key: string) => {
        values.delete(key);
        return Promise.resolve(1);
      }),
    };
    const service = new AnalyticsCacheService(redis as never);
    const compute = vi.fn(() => Promise.resolve({ averagePercentage: 70 }));
    await service.read('school-a', 'teacher-a', 'exam:x', { term: 't1' }, compute);
    await service.read('school-a', 'teacher-a', 'exam:x', { term: 't1' }, compute);
    await service.read('school-a', 'teacher-b', 'exam:x', { term: 't1' }, compute);
    expect(compute).toHaveBeenCalledTimes(2);
    await service.invalidateSchool('school-a');
    await service.read('school-a', 'teacher-a', 'exam:x', { term: 't1' }, compute);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('falls back to the source query when Redis is unavailable', async () => {
    const redis = {
      get: vi.fn(() => Promise.reject(new Error('Redis unavailable'))),
      set: vi.fn(),
      incr: vi.fn(),
      del: vi.fn(),
    };
    const service = new AnalyticsCacheService(redis as never);
    const compute = vi.fn(() => Promise.resolve({ averagePercentage: 70 }));
    await expect(service.read('school-a', 'teacher-a', 'exam:x', {}, compute)).resolves.toEqual({
      averagePercentage: 70,
    });
    expect(compute).toHaveBeenCalledTimes(1);
    await expect(service.invalidateSchool('school-a')).resolves.toBeUndefined();
  });
});
