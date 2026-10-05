'use client';

import type { ApiComponents } from '@atlas/contracts';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format/date';
import { sessionTypeLabel } from '@/lib/format/labels';

type ExamSession = ApiComponents['schemas']['ExamSessionResponseDto'];

/**
 * F12 — shown only when `ExamRosterScreen` is reached with no `sessionId`
 * already resolved (a deep link/bookmark/back-navigation — a session row's
 * own "Manage students" link always arrives with `?sessionId=` already
 * set, so this never renders in that path). Lists only currently-OPEN
 * sessions, since authorize/revoke are both meaningless against a
 * CLOSED/COMPLETED/CANCELLED one.
 */
export function SessionPicker({
  sessions,
  selectedSessionId,
  onSelect,
}: {
  sessions: ExamSession[];
  selectedSessionId: string | undefined;
  onSelect: (sessionId: string) => void;
}) {
  const open = sessions.filter((s) => s.status === 'OPEN');
  if (open.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Select a session">
      {open.map((session) => (
        <button
          key={session.id}
          type="button"
          aria-pressed={session.id === selectedSessionId}
          onClick={() => onSelect(session.id)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
            session.id === selectedSessionId
              ? 'border-brand-primary bg-brand-primary text-brand-primary-foreground'
              : 'border-border bg-surface text-text-secondary hover:text-text-primary',
          )}
        >
          {sessionTypeLabel(session.sessionType)} session · opened{' '}
          {formatDateTime(session.reopenedAt ?? session.openedAt)}
        </button>
      ))}
    </div>
  );
}
