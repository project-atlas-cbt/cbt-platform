import { describe, expect, it } from 'vitest';
import { isNavigationAllowed, nextFurthestIndex, restoredPosition } from './navigation-policy';

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

describe('restoredPosition (audit P1-6)', () => {
  it('resumes at the saved question', () => {
    expect(
      restoredPosition({
        policy: 'FREE',
        questionCount: 10,
        savedCurrentIndex: 6,
        savedFurthestIndex: 8,
        answeredIndexes: [0, 1],
      }),
    ).toEqual({ currentIndex: 6, furthestIndex: 8 });
  });

  it('with no saved position (another PC), counts the last answered question as reached', () => {
    expect(
      restoredPosition({
        policy: 'SEQUENTIAL_WITH_REVISIT',
        questionCount: 10,
        savedCurrentIndex: undefined,
        savedFurthestIndex: undefined,
        answeredIndexes: [0, 4, 2],
      }),
    ).toEqual({ currentIndex: 0, furthestIndex: 4 });
  });

  it('SEQUENTIAL_NO_REVISIT resumes at the furthest question, never at a locked one', () => {
    expect(
      restoredPosition({
        policy: 'SEQUENTIAL_NO_REVISIT',
        questionCount: 10,
        savedCurrentIndex: undefined,
        savedFurthestIndex: undefined,
        answeredIndexes: [0, 1, 2, 3, 4, 5, 6],
      }),
    ).toEqual({ currentIndex: 6, furthestIndex: 6 });
  });

  it('clamps a saved position beyond the paper', () => {
    expect(
      restoredPosition({
        policy: 'FREE',
        questionCount: 3,
        savedCurrentIndex: 7,
        savedFurthestIndex: 9,
        answeredIndexes: [],
      }),
    ).toEqual({ currentIndex: 2, furthestIndex: 2 });
  });
});
