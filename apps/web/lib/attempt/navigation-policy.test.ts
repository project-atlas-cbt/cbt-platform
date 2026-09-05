import { describe, expect, it } from 'vitest';
import { isNavigationAllowed, nextFurthestIndex } from './navigation-policy';

describe('isNavigationAllowed', () => {
  it('FREE: every in-range index is reachable regardless of furthest visited', () => {
    expect(isNavigationAllowed('FREE', 0, 5, 10)).toBe(true);
    expect(isNavigationAllowed('FREE', 9, 0, 10)).toBe(true);
  });

  it('rejects any out-of-range index for every policy', () => {
    expect(isNavigationAllowed('FREE', -1, 0, 10)).toBe(false);
    expect(isNavigationAllowed('FREE', 10, 0, 10)).toBe(false);
  });

  it('SEQUENTIAL_NO_REVISIT: only the furthest-visited index or beyond is reachable', () => {
    expect(isNavigationAllowed('SEQUENTIAL_NO_REVISIT', 2, 2, 10)).toBe(true);
    expect(isNavigationAllowed('SEQUENTIAL_NO_REVISIT', 5, 2, 10)).toBe(true); // jump ahead ok
    expect(isNavigationAllowed('SEQUENTIAL_NO_REVISIT', 1, 2, 10)).toBe(false); // going back is not
  });

  it('SEQUENTIAL_WITH_REVISIT: every already-visited index plus exactly one step forward', () => {
    expect(isNavigationAllowed('SEQUENTIAL_WITH_REVISIT', 0, 3, 10)).toBe(true); // revisit
    expect(isNavigationAllowed('SEQUENTIAL_WITH_REVISIT', 3, 3, 10)).toBe(true); // stay
    expect(isNavigationAllowed('SEQUENTIAL_WITH_REVISIT', 4, 3, 10)).toBe(true); // advance by one
    expect(isNavigationAllowed('SEQUENTIAL_WITH_REVISIT', 5, 3, 10)).toBe(false); // skip ahead not ok
  });
});

describe('nextFurthestIndex', () => {
  it('only ever increases', () => {
    expect(nextFurthestIndex(3, 5)).toBe(5);
    expect(nextFurthestIndex(3, 1)).toBe(3);
    expect(nextFurthestIndex(3, 3)).toBe(3);
  });
});
