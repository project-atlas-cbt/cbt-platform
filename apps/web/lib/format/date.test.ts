import { afterEach, describe, expect, it } from 'vitest';
import { formatDateTime, setDisplayTimeZone, wallTimeToIso } from './date';

afterEach(() => setDisplayTimeZone(undefined));

describe('school timezone (P2-24, ADR-0027)', () => {
  it("formats in the school's timezone once one is set", () => {
    setDisplayTimeZone('Africa/Lagos');
    // 13:00 UTC is 14:00 in Lagos (UTC+1, no DST).
    expect(formatDateTime('2026-10-12T13:00:00.000Z')).toMatch(/2:00|14:00/);
    setDisplayTimeZone('UTC');
    expect(formatDateTime('2026-10-12T13:00:00.000Z')).toMatch(/1:00|13:00/);
  });

  it("reads a datetime-local value as the school's wall time", () => {
    expect(wallTimeToIso('2026-10-12T14:30', 'Africa/Lagos')).toBe('2026-10-12T13:30:00.000Z');
    expect(wallTimeToIso('2026-10-12T14:30', 'UTC')).toBe('2026-10-12T14:30:00.000Z');
    // Across a DST change the offset of that wall time is used.
    expect(wallTimeToIso('2026-07-01T12:00', 'Europe/London')).toBe('2026-07-01T11:00:00.000Z');
    expect(wallTimeToIso('2026-12-01T12:00', 'Europe/London')).toBe('2026-12-01T12:00:00.000Z');
  });

  it('uses the display timezone by default', () => {
    setDisplayTimeZone('Africa/Lagos');
    expect(wallTimeToIso('2026-10-12T00:15')).toBe('2026-10-11T23:15:00.000Z');
  });
});
