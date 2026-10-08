import { describe, expect, it } from 'vitest';
import { hasFrequentLeaves } from './live-attempts-table';

const counts = (WINDOW_BLUR: number, FULLSCREEN_EXIT: number, TAB_HIDDEN = 0) =>
  ({
    WINDOW_BLUR,
    FULLSCREEN_EXIT,
    TAB_HIDDEN,
    RECONNECTED: 0,
    RESUMED: 0,
    BINDING_MISMATCH: 0,
  }) as never;

describe('hasFrequentLeaves', () => {
  it('flags at three leaves and ignores Tab hidden, which double-counts a tab switch', () => {
    expect(hasFrequentLeaves(null)).toBe(false);
    expect(hasFrequentLeaves(counts(2, 0, 9))).toBe(false);
    expect(hasFrequentLeaves(counts(2, 1))).toBe(true);
    expect(hasFrequentLeaves(counts(3, 0))).toBe(true);
  });
});
