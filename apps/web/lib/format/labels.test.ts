import { describe, expect, it } from 'vitest';
import { difficultyLabel, sentenceCase, sessionTypeLabel } from './labels';

describe('display labels', () => {
  it('names session types in words', () => {
    expect(sessionTypeLabel('STANDARD')).toBe('Standard');
    expect(sessionTypeLabel('MAKEUP')).toBe('Makeup');
    expect(sessionTypeLabel('SPECIAL')).toBe('Exceptional reattempt');
    expect(sessionTypeLabel('SOMETHING_NEW')).toBe('Something new');
  });

  it('sentence-cases difficulty and tolerates a missing value', () => {
    expect(difficultyLabel('EASY')).toBe('Easy');
    expect(difficultyLabel(undefined)).toBe('');
    expect(sentenceCase('NOT_STARTED')).toBe('Not started');
  });
});
