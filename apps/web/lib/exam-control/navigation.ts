import type { ApiComponents } from '@atlas/contracts';

type ExamSessionSummary = ApiComponents['schemas']['ExamSessionResponseDto'];

export function examControlPath(basePath: string, examId: string): string {
  return `${basePath}/${examId}`;
}

export function examControlStudentsPath(basePath: string, examId: string): string {
  return `${basePath}/${examId}/students`;
}

export function examControlHistoryPath(basePath: string, examId: string): string {
  return `${basePath}/${examId}/history`;
}

/**
 * `SessionPicker`'s default when a screen is reached with no `sessionId`
 * already resolved (a deep link/bookmark/back-navigation, as opposed to a
 * session row's own "Manage students" link, which always arrives with
 * `?sessionId=` already set) — the most-recently-opened currently-OPEN
 * session. `undefined` when none are OPEN (the screen then shows an
 * "open a session first" empty state rather than a picker).
 */
export function defaultOpenSession(sessions: ExamSessionSummary[]): ExamSessionSummary | undefined {
  const open = sessions.filter((s) => s.status === 'OPEN');
  if (open.length === 0) return undefined;
  return open.reduce((latest, current) => {
    const latestFrom = latest.reopenedAt ?? latest.openedAt;
    const currentFrom = current.reopenedAt ?? current.openedAt;
    return currentFrom > latestFrom ? current : latest;
  });
}
