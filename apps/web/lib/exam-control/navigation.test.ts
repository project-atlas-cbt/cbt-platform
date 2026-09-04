import { describe, expect, it } from 'vitest';
import { defaultOpenSession } from './navigation';

function session(overrides: Partial<Record<string, unknown>>) {
  return {
    id: 's1',
    examId: 'e1',
    sessionType: 'STANDARD',
    status: 'OPEN',
    openedAt: '2026-01-01T00:00:00Z',
    openedByMembershipId: 'm1',
    openedByName: 'Ade Ola',
    closedAt: null,
    closedByMembershipId: null,
    closedByName: null,
    reopenedAt: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as never;
}

describe('defaultOpenSession', () => {
  it('returns undefined when no session is OPEN', () => {
    expect(defaultOpenSession([session({ id: 's1', status: 'CLOSED' })])).toBeUndefined();
  });

  it('returns the only OPEN session', () => {
    const open = session({ id: 's1', status: 'OPEN' });
    expect(defaultOpenSession([session({ id: 's2', status: 'CLOSED' }), open])).toEqual(open);
  });

  it('picks the most-recently-opened OPEN session, by openedAt', () => {
    const older = session({ id: 's1', status: 'OPEN', openedAt: '2026-01-01T00:00:00Z' });
    const newer = session({ id: 's2', status: 'OPEN', openedAt: '2026-01-02T00:00:00Z' });
    expect(defaultOpenSession([older, newer])).toEqual(newer);
  });

  it('prefers reopenedAt over openedAt when a session has been reopened', () => {
    const reopenedLongAgo = session({
      id: 's1',
      status: 'OPEN',
      openedAt: '2026-01-05T00:00:00Z',
      reopenedAt: '2026-01-05T01:00:00Z',
    });
    const openedRecently = session({
      id: 's2',
      status: 'OPEN',
      openedAt: '2026-01-06T00:00:00Z',
      reopenedAt: null,
    });
    expect(defaultOpenSession([reopenedLongAgo, openedRecently])).toEqual(openedRecently);
  });
});
