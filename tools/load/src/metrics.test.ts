import { describe, expect, it } from 'vitest';
import { imageSize } from 'image-size';
import { BUDGETS, Recorder, answerSuccessRate, checkLatency } from './metrics.js';
import { makePng } from './png.js';

describe('Recorder', () => {
  it('computes percentiles and status counts per label', () => {
    const r = new Recorder();
    for (let i = 1; i <= 100; i++) r.record('answer.batch', i, 200);
    r.record('answer.batch', 500, 503);
    const s = r.stats('answer.batch')!;
    expect(s.count).toBe(101);
    expect(s.ok).toBe(100);
    expect(s.status['503']).toBe(1);
    expect(s.p50).toBeGreaterThanOrEqual(50);
    expect(s.p50).toBeLessThanOrEqual(52);
    expect(s.max).toBeCloseTo(500, 0);
  });
});

describe('answerSuccessRate (policy refusals are not failures)', () => {
  it('counts 5xx, 429 and network failures as failures, 409 refusals as success', () => {
    const r = new Recorder();
    for (let i = 0; i < 996; i++) r.record('a', 10, 200);
    r.record('a', 10, 409);
    r.record('a', 10, 500);
    r.record('a', 10, 429);
    r.recordNetworkFailure('a', 30_000);
    expect(answerSuccessRate(r.stats('a')!)).toBeCloseTo(997 / 1000, 6);
  });
});

describe('checkLatency', () => {
  it('passes and fails against the agreed answer-save budget', () => {
    const r = new Recorder();
    for (let i = 0; i < 100; i++) r.record('fast', 50, 200);
    for (let i = 0; i < 100; i++) r.record('slow', 900, 200);
    expect(checkLatency('fast', r.stats('fast'), BUDGETS.answerSave).every((c) => c.pass)).toBe(
      true,
    );
    expect(checkLatency('slow', r.stats('slow'), BUDGETS.answerSave).every((c) => c.pass)).toBe(
      false,
    );
    expect(checkLatency('none', undefined, BUDGETS.answerSave)[0]!.pass).toBe(false);
  });
});

describe('makePng (media-heavy provisioning)', () => {
  it('produces a valid PNG of roughly the requested size', () => {
    const png = makePng(150);
    const size = imageSize(png);
    expect(size.type).toBe('png');
    expect(png.length).toBeGreaterThan(120 * 1024);
    expect(png.length).toBeLessThan(200 * 1024);
  });
});
