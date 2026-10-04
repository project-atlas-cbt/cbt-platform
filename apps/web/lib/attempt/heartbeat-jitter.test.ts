import { describe, expect, it } from 'vitest';
import {
  HEARTBEAT_INTERVAL_MS,
  firstHeartbeatDelay,
  nextHeartbeatDelay,
} from './use-attempt-sync-engine';

describe('heartbeat jitter (F20, from B21)', () => {
  it('each interval varies ±10 % around 30 s', () => {
    expect(nextHeartbeatDelay(() => 0)).toBe(HEARTBEAT_INTERVAL_MS * 0.9);
    expect(nextHeartbeatDelay(() => 1)).toBe(HEARTBEAT_INTERVAL_MS * 1.1);
  });

  it('the first beat is spread across the whole first interval', () => {
    expect(firstHeartbeatDelay(() => 0)).toBe(0);
    expect(firstHeartbeatDelay(() => 0.5)).toBe(HEARTBEAT_INTERVAL_MS / 2);
  });

  it('a lab of 40 machines does not beat in phase', () => {
    const delays = new Set(Array.from({ length: 40 }, () => nextHeartbeatDelay()));
    expect(delays.size).toBeGreaterThan(30);
  });
});
