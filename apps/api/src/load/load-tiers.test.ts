import { describe, expect, it } from 'vitest';
import { isControlStream, isExamWritePath, loadTierOf } from './load-tiers.js';

const ID = '01a0feab-0000-7000-8000-000000000001';

describe('loadTierOf (B21, R-12)', () => {
  it.each([
    [`/v1/attempts/${ID}/answers/batch`],
    [`/v1/attempts/${ID}/answers/${ID}`],
    [`/v1/attempts/${ID}/heartbeat`],
    [`/v1/attempts/${ID}/submit`],
    [`/v1/attempts/${ID}/status`],
    [`/v1/attempts/${ID}`],
    [`/v1/exams/${ID}/attempts`],
    ['/v1/student/assessment'],
    [`/v1/student/assessment/${ID}/preview`],
    ['/v1/auth/login'],
    ['/v1/tenant/resolve'],
    ['/v1/health/ready'],
  ])('never sheds exam execution or sign-in: %s', (url) => {
    expect(loadTierOf(url)).toBe('critical');
  });

  it.each([
    [`/v1/analytics/exams/${ID}`],
    ['/v1/analytics/school?termId=x'],
    ['/v1/reports/exams/x/results'],
    ['/v1/exports'],
    [`/v1/exports/${ID}/download`],
    ['/v1/search?q=ade'],
    ['/v1/imports/students/upload-target'],
    ['/v1/platform/analytics/overview'],
    ['/v1/platform/exports'],
  ])('sheds reporting first: %s', (url) => {
    expect(loadTierOf(url)).toBe('deferrable');
  });

  it.each([
    [`/v1/exams/${ID}/control`],
    ['/v1/questions'],
    [`/v1/exams/${ID}/sessions`],
    ['/v1/notifications'],
  ])('everything else is standard: %s', (url) => {
    expect(loadTierOf(url)).toBe('standard');
  });

  it('does not mistake an exam-attempts sub-route for the start route', () => {
    expect(loadTierOf(`/v1/exams/${ID}/attempts/extra`)).toBe('standard');
  });

  it('recognises the Control Center stream', () => {
    expect(isControlStream(`/v1/exams/${ID}/control/stream`)).toBe(true);
    expect(isControlStream(`/v1/exams/${ID}/control`)).toBe(false);
  });

  it('times only the exam write path for the latency signal', () => {
    expect(isExamWritePath(`/v1/attempts/${ID}/answers/batch`)).toBe(true);
    expect(isExamWritePath(`/v1/attempts/${ID}/heartbeat?x=1`)).toBe(true);
    expect(isExamWritePath(`/v1/attempts/${ID}/submit`)).toBe(true);
    expect(isExamWritePath(`/v1/exams/${ID}/attempts`)).toBe(false);
    expect(isExamWritePath('/v1/auth/login')).toBe(false);
    expect(isExamWritePath('/v1/analytics/school')).toBe(false);
  });
});
