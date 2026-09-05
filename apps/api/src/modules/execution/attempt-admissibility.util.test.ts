import { afterEach, describe, expect, it } from 'vitest';
import {
  attemptGraceWindowSeconds,
  evaluateWriteAdmissibility,
} from './attempt-admissibility.util.js';

describe('attemptGraceWindowSeconds', () => {
  afterEach(() => {
    delete process.env.ATTEMPT_GRACE_WINDOW_SECONDS;
  });

  it('defaults to 60 when unset', () => {
    expect(attemptGraceWindowSeconds()).toBe(60);
  });

  it('reads a valid override from the environment', () => {
    process.env.ATTEMPT_GRACE_WINDOW_SECONDS = '30';
    expect(attemptGraceWindowSeconds()).toBe(30);
  });

  it('falls back to the default for a non-numeric value', () => {
    process.env.ATTEMPT_GRACE_WINDOW_SECONDS = 'not-a-number';
    expect(attemptGraceWindowSeconds()).toBe(60);
  });

  it('falls back to the default for a negative value', () => {
    process.env.ATTEMPT_GRACE_WINDOW_SECONDS = '-5';
    expect(attemptGraceWindowSeconds()).toBe(60);
  });

  it('accepts zero (a school-independent, environment-level choice to disable grace entirely)', () => {
    process.env.ATTEMPT_GRACE_WINDOW_SECONDS = '0';
    expect(attemptGraceWindowSeconds()).toBe(0);
  });
});

describe('evaluateWriteAdmissibility', () => {
  afterEach(() => {
    delete process.env.ATTEMPT_GRACE_WINDOW_SECONDS;
  });

  const expiresAt = new Date('2026-01-01T10:00:00.000Z');

  it('ON_TIME for a write at or before expiry', () => {
    expect(evaluateWriteAdmissibility(expiresAt, new Date('2026-01-01T09:59:59.000Z'))).toBe(
      'ON_TIME',
    );
    expect(evaluateWriteAdmissibility(expiresAt, expiresAt)).toBe('ON_TIME');
  });

  it('GRACE_WINDOW for a write within 60s after expiry by default', () => {
    expect(evaluateWriteAdmissibility(expiresAt, new Date('2026-01-01T10:00:30.000Z'))).toBe(
      'GRACE_WINDOW',
    );
    // exact boundary — inclusive
    expect(evaluateWriteAdmissibility(expiresAt, new Date('2026-01-01T10:01:00.000Z'))).toBe(
      'GRACE_WINDOW',
    );
  });

  it('REJECTED for a write beyond the grace window', () => {
    expect(evaluateWriteAdmissibility(expiresAt, new Date('2026-01-01T10:01:00.001Z'))).toBe(
      'REJECTED',
    );
  });

  it('honours a configured grace window override', () => {
    process.env.ATTEMPT_GRACE_WINDOW_SECONDS = '5';
    expect(evaluateWriteAdmissibility(expiresAt, new Date('2026-01-01T10:00:05.000Z'))).toBe(
      'GRACE_WINDOW',
    );
    expect(evaluateWriteAdmissibility(expiresAt, new Date('2026-01-01T10:00:05.001Z'))).toBe(
      'REJECTED',
    );
  });
});
