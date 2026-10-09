'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ApiComponents } from '@atlas/contracts';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format/date';
import { useStudentHistory } from '@/lib/people/queries';
import { cn } from '@/lib/utils';

type HistoryEvent = ApiComponents['schemas']['HistoryEventDto'];
type HistorySession = ApiComponents['schemas']['HistorySessionDto'];

const ROLE_LABEL: Record<string, string> = {
  SOFTWARE_ADMIN: 'Software Admin',
  SCHOOL_ADMIN: 'School Admin',
  MODERATOR: 'Moderator',
  HOD: 'HOD',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

function byWhom(e: { actorName: string | null; actorRole: string | null }): string | null {
  const role = e.actorRole ? (ROLE_LABEL[e.actorRole] ?? e.actorRole) : null;
  if (e.actorName && role) return `${e.actorName} (${role})`;
  return e.actorName ?? role;
}

function EventList({ events, label }: { events: HistoryEvent[]; label: string }) {
  return (
    <ol className="space-y-1.5" aria-label={label}>
      {events.map((e, i) => {
        const who = byWhom(e);
        return (
          <li key={`${e.at}-${i}`} className="grid grid-cols-[5.5rem_1fr] gap-x-3 text-sm">
            <time dateTime={e.at} className="tabular-nums text-text-muted">
              {formatDate(e.at)}
            </time>
            <div>
              <span className="text-text-primary">{e.summary}</span>
              {e.detail ? <span className="text-text-secondary"> · {e.detail}</span> : null}
              {who ? <span className="block text-xs text-text-muted">by {who}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function examsLine(exams: HistorySession['exams']): string | null {
  const parts: string[] = [];
  if (exams.attended > 0) parts.push(`${exams.attended} sat`);
  if (exams.absent > 0) parts.push(`${exams.absent} missed`);
  if (exams.excused > 0) parts.push(`${exams.excused} excused`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * The student's academic history, one block per session, newest first
 * (2026-10-09 redesign). Each block leads with the class and the subjects
 * taken there, lists what changed (from what to what, and by whom), and
 * closes with the rollover outcome and the session's exams. Account events
 * sit apart, collapsed. Everything comes from `GET /students/:id/history`,
 * which reads the records themselves, so it can't disagree with them.
 */
export function AcademicHistory({ studentProfileId }: { studentProfileId: string }) {
  const history = useStudentHistory(studentProfileId);
  const [accountOpen, setAccountOpen] = useState(false);

  if (history.isPending) return <Skeleton className="h-40 w-full" />;
  if (history.isError) {
    return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  }
  const { sessions, accountEvents } = history.data;
  if (sessions.length === 0 && accountEvents.length === 0) {
    return (
      <EmptyState
        title="No history yet"
        description="It starts when the student is enrolled in a class."
      />
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const exams = examsLine(s.exams);
        return (
          <article
            key={s.academicSessionId}
            className="rounded-md border border-border"
            aria-label={`${s.sessionName} session`}
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2">
              <h4 className="text-sm font-semibold text-text-primary">{s.sessionName}</h4>
              <span className="flex items-center gap-2 text-sm text-text-secondary">
                {s.className}
                {s.current ? <Badge status="info">Current</Badge> : null}
              </span>
            </header>
            <div className="space-y-3 px-3 py-3">
              <p className="text-sm">
                <span className="text-text-muted">Subjects </span>
                <span className="text-text-primary">
                  {s.subjects.length > 0 ? s.subjects.join(', ') : 'None'}
                </span>{' '}
                <span className="text-text-muted">({s.subjects.length})</span>
              </p>
              {s.events.length > 0 ? (
                <EventList events={s.events} label={`Changes in ${s.sessionName}`} />
              ) : null}
              {s.outcome || exams ? (
                <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 border-t border-border pt-2 text-sm">
                  {s.outcome ? (
                    <>
                      <dt className="text-text-muted">Outcome</dt>
                      <dd className="text-text-primary">
                        {s.outcome.label}
                        {s.outcome.reason ? (
                          <span className="text-text-secondary"> · {s.outcome.reason}</span>
                        ) : null}
                      </dd>
                    </>
                  ) : null}
                  {exams ? (
                    <>
                      <dt className="text-text-muted">Exams</dt>
                      <dd className="text-text-primary">{exams}</dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
            </div>
          </article>
        );
      })}

      {accountEvents.length > 0 ? (
        <div className="rounded-md border border-border">
          <button
            type="button"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-text-primary hover:bg-surface-muted"
          >
            Account ({accountEvents.length})
            <ChevronDown
              className={cn(
                'size-4 text-text-muted transition-transform',
                accountOpen && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
          {accountOpen ? (
            <div className="border-t border-border px-3 py-3">
              <EventList events={accountEvents} label="Account events" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
