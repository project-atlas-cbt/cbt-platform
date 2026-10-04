import { describe, expect, it } from 'vitest';
import { decodeExamControlEvent, encodeExamControlEvent } from './control-cache.js';

describe('exam control event envelope (B21, R-04)', () => {
  it('round-trips an id with a JSON payload', () => {
    const payload = JSON.stringify({ examId: 'e', note: 'line\nbreak' });
    expect(decodeExamControlEvent(encodeExamControlEvent('1700000000000-0', payload))).toEqual({
      id: '1700000000000-0',
      payload,
    });
  });

  it('treats a bare pre-B21 snapshot as a payload without id', () => {
    const payload = JSON.stringify({ examId: 'e' });
    expect(decodeExamControlEvent(payload)).toEqual({ payload });
  });
});

describe('B23 live-attempt signals (M-08, M-09)', () => {
  it('flags an attempt disconnected only after three missed heartbeats', async () => {
    const { isDisconnected, DISCONNECTED_AFTER_MS } = await import('./control-cache.js');
    const now = Date.parse('2026-10-04T10:00:00Z');
    expect(isDisconnected(new Date(now - 30_000), now)).toBe(false);
    expect(isDisconnected(new Date(now - DISCONNECTED_AFTER_MS), now)).toBe(false);
    expect(isDisconnected(new Date(now - DISCONNECTED_AFTER_MS - 1), now)).toBe(true);
  });

  it('counts every signal type, zero when absent', async () => {
    const { attemptSignalCounts } = await import('./control-cache.js');
    expect(
      attemptSignalCounts([
        { type: 'TAB_HIDDEN', count: 3 },
        { type: 'RECONNECTED', count: 1 },
      ]),
    ).toEqual({
      WINDOW_BLUR: 0,
      FULLSCREEN_EXIT: 0,
      TAB_HIDDEN: 3,
      RECONNECTED: 1,
      RESUMED: 0,
      BINDING_MISMATCH: 0,
    });
  });
});
