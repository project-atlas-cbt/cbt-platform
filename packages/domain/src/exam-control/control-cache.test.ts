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
