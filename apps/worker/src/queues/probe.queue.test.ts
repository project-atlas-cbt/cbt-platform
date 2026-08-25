import { describe, expect, it } from 'vitest';
import { PROBE_QUEUE_NAME } from './probe.queue.js';

describe('probe queue', () => {
  it('has a stable, namespaced queue name', () => {
    expect(PROBE_QUEUE_NAME).toBe('atlas-b0-probe');
  });
});
