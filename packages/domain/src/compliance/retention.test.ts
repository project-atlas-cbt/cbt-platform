import { describe, expect, it } from 'vitest';
import { RETENTION_SCHEDULE } from './retention.js';

describe('RETENTION_SCHEDULE (B20, ADR-0028)', () => {
  it('only ever purges or redacts OPERATIONAL data', () => {
    for (const rule of RETENTION_SCHEDULE) {
      if (rule.action !== 'RETAIN_INDEFINITELY') {
        expect(rule.category, rule.id).toBe('OPERATIONAL');
        expect(rule.afterDays, rule.id).toBeGreaterThan(0);
      }
    }
  });

  it('retains academic evidence and audit indefinitely', () => {
    const retained = RETENTION_SCHEDULE.filter((r) => r.action === 'RETAIN_INDEFINITELY');
    const tables = retained.flatMap((r) => r.table.split(',').map((t) => t.trim()));
    for (const t of ['exam_attempts', 'attempt_answers', 'results', 'audit_events']) {
      expect(tables).toContain(t);
    }
  });

  it('has unique ids', () => {
    const ids = RETENTION_SCHEDULE.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
