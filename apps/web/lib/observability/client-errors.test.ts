import { describe, expect, it } from 'vitest';
import { routeArea } from '@/components/observability/client-error-tracking';
import {
  isClientErrorTrackingConfigured,
  reportClientError,
  scrubClientEvent,
} from './client-errors';

describe('scrubClientEvent (F20 DoD 11 — same rules as the API)', () => {
  it('drops request bodies, cookies, headers and query strings; keeps only the user id', () => {
    const event = scrubClientEvent({
      type: undefined,
      request: {
        url: 'https://greenfield.example/student/exam/1?token=abc',
        data: { answers: [{ selectedOptionId: 'o2' }] },
        cookies: { atlas_session: 's' },
        headers: { 'x-csrf-token': 't' },
        query_string: 'token=abc',
      },
      user: { id: 'user-1', email: 'ada@school.example', username: 'ada' },
    });
    expect(event.request).toEqual({ url: 'https://greenfield.example/student/exam/1' });
    expect(event.user).toEqual({ id: 'user-1' });
  });

  it('scrubs personal data out of messages and exception text', () => {
    const event = scrubClientEvent({
      type: undefined,
      message: 'failed for ada@school.example',
      exception: { values: [{ type: 'Error', value: 'user ada@school.example not found' }] },
    });
    expect(event.message).not.toContain('ada@school.example');
    expect(event.exception?.values?.[0]?.value).not.toContain('ada@school.example');
  });

  it('drops console and UI breadcrumbs, which can carry question or answer text', () => {
    const event = scrubClientEvent({
      type: undefined,
      breadcrumbs: [
        { category: 'console', message: 'answer: 4' },
        { category: 'ui.click', message: 'label "4"' },
        { category: 'fetch', data: { url: '/v1/attempts/1/answers/batch', answers: ['o2'] } },
      ],
    });
    expect(event.breadcrumbs).toHaveLength(1);
    expect(JSON.stringify(event.breadcrumbs)).not.toContain('o2');
  });
});

describe('client error tracking without a DSN', () => {
  it('is off and reporting is a no-op', () => {
    expect(isClientErrorTrackingConfigured()).toBe(false);
    expect(() => reportClientError(new Error('x'), { source: 'test' })).not.toThrow();
  });
});

describe('routeArea', () => {
  it('is coarse and never carries ids', () => {
    expect(routeArea('/student/exam/0190a000-0000-7000-8000-000000000001')).toBe('student/exam');
    expect(routeArea('/admin/schools')).toBe('admin/schools');
    expect(routeArea('/')).toBe('root');
  });
});
