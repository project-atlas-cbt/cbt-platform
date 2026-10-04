import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAttemptTimer } from './use-attempt-timer';

describe('useAttemptTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('F20 (DoD 5) — renders at most once per displayed second, not every frame', () => {
    const now = Date.parse('2026-01-01T10:00:00.000Z');
    vi.setSystemTime(now);
    const expiresAt = new Date(now + 10 * 60_000).toISOString();
    // jsdom reports every document as hidden; this test is about the visible tab.
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useAttemptTimer('attempt-r', expiresAt, 0, vi.fn());
    });
    const afterMount = renders;
    // One act() per 250 ms tick — act batches every update inside it.
    for (let i = 0; i < 40; i += 1) {
      act(() => {
        vi.advanceTimersByTime(250);
      });
    }
    // 10 s of ticking at 4 Hz → ~10 renders (one per second), never ~40 or ~600.
    expect(renders - afterMount).toBeLessThanOrEqual(11);
    expect(renders - afterMount).toBeGreaterThanOrEqual(9);
    hidden.mockRestore();
  });

  it('DoD 12 — remainingMs is derived from expiresAt/skew, immune to the local clock moving backward', () => {
    const now = Date.parse('2026-01-01T10:00:00.000Z');
    vi.setSystemTime(now);
    const expiresAt = new Date(now + 10 * 60_000).toISOString(); // 10 minutes out
    const onExpire = vi.fn();

    const { result } = renderHook(() => useAttemptTimer('attempt-1', expiresAt, 0, onExpire));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const before = result.current.remainingMs;
    expect(before).toBeGreaterThan(9 * 60_000);

    // Simulate the student winding their system clock back by an hour —
    // a genuine device-clock-manipulation attempt.
    act(() => {
      vi.setSystemTime(now - 60 * 60_000);
      vi.advanceTimersByTime(0);
    });
    // Remaining time is unaffected: it's still ~10 minutes from the true
    // expiry, not "now (which just jumped back) + skew".
    expect(result.current.remainingMs).toBeGreaterThan(9 * 60_000);
  });

  it('DoD 13 — fires each warning exactly once at its threshold', () => {
    const now = Date.parse('2026-01-01T10:00:00.000Z');
    vi.setSystemTime(now);
    const expiresAt = new Date(now + 5 * 60_000 + 500).toISOString();
    const { result, rerender } = renderHook(() =>
      useAttemptTimer('attempt-1', expiresAt, 0, vi.fn()),
    );

    expect(result.current.fiveMinuteWarningShown).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    rerender();
    expect(result.current.fiveMinuteWarningShown).toBe(true);
    expect(result.current.oneMinuteWarningShown).toBe(false);

    act(() => {
      vi.advanceTimersByTime(4 * 60_000);
    });
    rerender();
    expect(result.current.oneMinuteWarningShown).toBe(true);
  });

  it('DoD 15 — calls onExpire exactly once when remaining time reaches zero, never again on later ticks', () => {
    const now = Date.parse('2026-01-01T10:00:00.000Z');
    vi.setSystemTime(now);
    const expiresAt = new Date(now + 1_000).toISOString();
    const onExpire = vi.fn();
    renderHook(() => useAttemptTimer('attempt-1', expiresAt, 0, onExpire));

    // A little past the deadline, not exactly at it — rAF's own ~16ms frame
    // granularity under fake timers means a frame landing just short of an
    // exact-duration advance can miss the zero-crossing by one frame.
    act(() => {
      vi.advanceTimersByTime(1_100);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('never fires onExpire when no expiresAt is supplied (non-leader tab)', () => {
    const onExpire = vi.fn();
    renderHook(() => useAttemptTimer('attempt-1', undefined, 0, onExpire));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onExpire).not.toHaveBeenCalled();
  });
});
