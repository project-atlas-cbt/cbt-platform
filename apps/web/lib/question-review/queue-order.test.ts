import { describe, expect, it } from 'vitest';
import {
  flattenQueueOrder,
  formatQueueAge,
  getAdjacentQuestionIds,
  type ReviewQueueLike,
} from './queue-order';

function queue(subjects: ReviewQueueLike['subjects']): ReviewQueueLike {
  return { subjects };
}

describe('flattenQueueOrder', () => {
  it('returns an empty array for undefined or empty queues', () => {
    expect(flattenQueueOrder(undefined)).toEqual([]);
    expect(flattenQueueOrder(queue([]))).toEqual([]);
  });

  it('orders items within a subject oldest-submitted-first', () => {
    const result = flattenQueueOrder(
      queue([
        {
          items: [
            { questionId: 'q-newer', submittedAt: '2026-09-02T10:00:00.000Z' },
            { questionId: 'q-older', submittedAt: '2026-09-01T10:00:00.000Z' },
          ],
        },
      ]),
    );
    expect(result).toEqual(['q-older', 'q-newer']);
  });

  it('preserves subject group order, ordering within each group independently', () => {
    const result = flattenQueueOrder(
      queue([
        {
          items: [
            { questionId: 'math-2', submittedAt: '2026-09-02T00:00:00.000Z' },
            { questionId: 'math-1', submittedAt: '2026-09-01T00:00:00.000Z' },
          ],
        },
        {
          items: [{ questionId: 'physics-1', submittedAt: '2026-08-30T00:00:00.000Z' }],
        },
      ]),
    );
    expect(result).toEqual(['math-1', 'math-2', 'physics-1']);
  });
});

describe('getAdjacentQuestionIds', () => {
  const order = ['a', 'b', 'c'];

  it('returns both neighbours for a middle item', () => {
    expect(getAdjacentQuestionIds(order, 'b')).toEqual({ previous: 'a', next: 'c' });
  });

  it('returns undefined previous for the first item', () => {
    expect(getAdjacentQuestionIds(order, 'a')).toEqual({ previous: undefined, next: 'b' });
  });

  it('returns undefined next for the last item', () => {
    expect(getAdjacentQuestionIds(order, 'c')).toEqual({ previous: 'b', next: undefined });
  });

  it('returns undefined for both when the id is not in the order (e.g. a cold deep link)', () => {
    expect(getAdjacentQuestionIds(order, 'unknown')).toEqual({
      previous: undefined,
      next: undefined,
    });
  });
});

describe('formatQueueAge', () => {
  const now = new Date('2026-09-03T12:00:00.000Z');

  it('formats sub-minute as "Just now"', () => {
    expect(formatQueueAge('2026-09-03T11:59:30.000Z', now)).toBe('Just now');
  });

  it('formats minutes', () => {
    expect(formatQueueAge('2026-09-03T11:30:00.000Z', now)).toBe('30m');
  });

  it('formats hours', () => {
    expect(formatQueueAge('2026-09-03T06:00:00.000Z', now)).toBe('6h');
  });

  it('formats days', () => {
    expect(formatQueueAge('2026-09-01T12:00:00.000Z', now)).toBe('2d');
  });

  it('never returns a negative duration for a clock-skewed future timestamp', () => {
    expect(formatQueueAge('2026-09-03T12:05:00.000Z', now)).toBe('Just now');
  });
});
