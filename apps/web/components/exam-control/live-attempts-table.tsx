'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ApiComponents } from '@atlas/contracts';
import { compareText } from '@atlas/domain';
import { Users } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Badge } from '@/components/ui/badge';
import { StudentSearch, filterStudents } from '@/components/ui/student-search';
import { useExamParticipation } from '@/lib/exam-control/queries';
import { formatDateTime } from '@/lib/format/date';

type LiveAttempt = ApiComponents['schemas']['ExamLiveAttemptRowDto'];
type ParticipationStudent = ApiComponents['schemas']['ParticipationStudentDto'];

type AttemptStatus = 'IN_PROGRESS' | 'NOT_STARTED' | 'SUBMITTED';

type SignalCounts = LiveAttempt['signals'];

type LiveAttemptTableRow = {
  studentProfileId: string;
  studentName: string;
  /** The school's student ID; '' when the roster has not loaded for a live attempt. */
  studentIdNumber: string;
  status: AttemptStatus;
  startedAt: string | null;
  timeRemainingSeconds: number | null;
  /** B23 (M-09): server-derived; only meaningful while IN_PROGRESS. */
  disconnected: boolean;
  lastSeenAt: string | null;
  /** B23 (M-08): integrity-signal counts; null when not in progress. */
  signals: SignalCounts | null;
};

/** ADR-0020: counts, not judgements — plain words for what the browser
 * reported, in a fixed order, never coloured as a warning. */
const SIGNAL_LABELS: [keyof SignalCounts, string][] = [
  ['WINDOW_BLUR', 'Left window'],
  ['TAB_HIDDEN', 'Tab hidden'],
  ['FULLSCREEN_EXIT', 'Left full screen'],
  ['RECONNECTED', 'Reconnected'],
  ['RESUMED', 'Resumed'],
  ['BINDING_MISMATCH', 'Device changed'],
];

export function describeSignals(signals: SignalCounts | null): string | null {
  if (!signals) return null;
  const parts = SIGNAL_LABELS.filter(([type]) => signals[type] > 0).map(
    ([type, label]) => `${label} ${signals[type]}`,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Leaves of the exam window at which a row is flagged for the invigilator to
 * look at. A tab switch fires both Left window and Tab hidden, so only Left
 * window and Left full screen are summed. A prompt to check, never a verdict. */
export const FREQUENT_LEAVES_THRESHOLD = 3;

export function hasFrequentLeaves(signals: SignalCounts | null): boolean {
  if (!signals) return false;
  return signals.WINDOW_BLUR + signals.FULLSCREEN_EXIT >= FREQUENT_LEAVES_THRESHOLD;
}

function fromLive(live: LiveAttempt, studentIdNumber: string): LiveAttemptTableRow {
  return {
    studentProfileId: live.studentProfileId,
    studentName: live.studentName,
    studentIdNumber,
    status: 'IN_PROGRESS',
    startedAt: live.startedAt,
    timeRemainingSeconds: live.timeRemainingSeconds,
    disconnected: live.disconnected,
    lastSeenAt: live.lastSeenAt,
    signals: live.signals,
  };
}

function idle(student: ParticipationStudent, status: AttemptStatus): LiveAttemptTableRow {
  return {
    studentProfileId: student.studentProfileId,
    studentName: student.studentName,
    studentIdNumber: student.studentIdNumber,
    status,
    startedAt: null,
    timeRemainingSeconds: null,
    disconnected: false,
    lastSeenAt: null,
    signals: null,
  };
}

const STATUS_RANK: Record<AttemptStatus, number> = {
  IN_PROGRESS: 0,
  NOT_STARTED: 1,
  SUBMITTED: 2,
};

/**
 * `04 §46`'s live table body, merged from the two sources the Control
 * Center genuinely owns: the snapshot's `liveAttempts` (IN_PROGRESS
 * ExamAttempt rows — the only rows for which the server ever emits "time
 * remaining") and the participation roster (every authorized student).
 * A student's status is therefore never client-constructed by subtraction:
 * in the live list → In progress; otherwise ATTENDED (has a
 * non-invalidated attempt) → Submitted; PENDING → Not started. ABSENT rows
 * are excluded — an absent student has no live attempt to track. Sort
 * order mirrors `04 §46`'s example (In progress → Not started → Submitted).
 */
function buildRows(
  liveAttempts: LiveAttempt[],
  students: ParticipationStudent[],
): LiveAttemptTableRow[] {
  const liveByProfile = new Map<string, LiveAttempt>();
  for (const row of liveAttempts) {
    if (!liveByProfile.has(row.studentProfileId)) liveByProfile.set(row.studentProfileId, row);
  }

  const rows: LiveAttemptTableRow[] = [];
  const seen = new Set<string>();
  for (const student of students) {
    if (student.rollupStatus === 'ABSENT') continue;
    seen.add(student.studentProfileId);
    const live = liveByProfile.get(student.studentProfileId);
    if (live) {
      rows.push({
        ...fromLive(live, student.studentIdNumber),
        studentProfileId: student.studentProfileId,
      });
    } else if (student.rollupStatus === 'ATTENDED') {
      rows.push(idle(student, 'SUBMITTED'));
    } else {
      rows.push(idle(student, 'NOT_STARTED'));
    }
  }

  // A live attempt is never hidden, even if its student dropped out of the
  // participation roster by the time this render happened (e.g. a REVOKED
  // participant mid-attempt) — the attempt still exists and is still live.
  for (const live of liveAttempts) {
    if (seen.has(live.studentProfileId)) continue;
    rows.push(fromLive(live, ''));
  }

  // B23: disconnected students lead the in-progress group — "who's
  // disconnected" is one of the questions the screen must answer at a
  // glance (doctrine §6).
  return rows.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      Number(b.disconnected) - Number(a.disconnected) ||
      compareText(a.studentName, b.studentName),
  );
}

/** Mirrors `timer-display.tsx`'s own `mm:ss` / `h:mm:ss` output (doctrine
 * §7's tabular numerals), but for a server-derived seconds value instead of
 * a millisecond timer. */
function formatRemainingSeconds(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(t / 3600);
  const minutes = Math.floor((t % 3600) / 60);
  const seconds = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** Re-renders this section once a second so the "Time left" column ticks
 * locally. `setState` runs inside the timer callback, never synchronously
 * in the effect body (`react-hooks/set-state-in-effect`). The source of
 * truth stays the server's `timeRemainingSeconds`/`computedAt`; this only
 * projects it forward — a bumped snapshot simply re-syncs. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function LiveAttemptsTable({
  examId,
  liveAttempts,
  computedAt,
}: {
  examId: string;
  liveAttempts: LiveAttempt[];
  computedAt: string;
}) {
  const participation = useExamParticipation(examId);
  const now = useNow(1000);
  const computedAtMs = Date.parse(computedAt);
  const rows = useMemo(
    () => buildRows(liveAttempts, participation.data?.students ?? []),
    [liveAttempts, participation.data],
  );

  const [query, setQuery] = useState('');
  const shown = useMemo(
    () =>
      filterStudents(rows, query, (r) => ({ studentId: r.studentIdNumber, name: r.studentName })),
    [rows, query],
  );

  if (participation.isError)
    return (
      <ErrorState
        title="Couldn't load the student roster"
        error={participation.error}
        onRetry={() => void participation.refetch()}
      />
    );

  const columns: DataTableColumn<LiveAttemptTableRow>[] = [
    {
      id: 'student',
      header: 'Student',
      cell: (row) => <span className="font-medium text-text-primary">{row.studentName}</span>,
    },
    { id: 'student-id', header: 'ID', cell: (row) => row.studentIdNumber || '—' },
    {
      id: 'status',
      header: 'Attempt status',
      cell: (row) => (
        <Badge
          status={
            row.status === 'IN_PROGRESS'
              ? 'info'
              : row.status === 'SUBMITTED'
                ? 'success'
                : 'neutral'
          }
        >
          {row.status === 'IN_PROGRESS'
            ? 'In progress'
            : row.status === 'SUBMITTED'
              ? 'Submitted'
              : 'Not started'}
        </Badge>
      ),
    },
    {
      id: 'connection',
      header: 'Connection',
      cell: (row) => {
        if (row.status !== 'IN_PROGRESS') return <span className="text-text-muted">—</span>;
        if (!row.disconnected) return <span className="text-text-secondary">Connected</span>;
        const minutes = row.lastSeenAt
          ? Math.max(1, Math.floor((now - Date.parse(row.lastSeenAt)) / 60_000))
          : null;
        return (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge status="warning">Disconnected</Badge>
            {minutes !== null && (
              <span className="tabular-nums text-text-secondary">no contact for {minutes} min</span>
            )}
          </span>
        );
      },
    },
    {
      id: 'signals',
      header: 'Signals',
      cell: (row) => {
        const text = describeSignals(row.signals);
        return text ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            {hasFrequentLeaves(row.signals) && <Badge status="warning">Check on student</Badge>}
            <span className="tabular-nums text-text-secondary">{text}</span>
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        );
      },
    },
    {
      id: 'started-at',
      header: 'Start time',
      cell: (row) =>
        row.status === 'IN_PROGRESS' && row.startedAt ? (
          <span className="tabular-nums text-text-secondary">{formatDateTime(row.startedAt)}</span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      id: 'time-left',
      header: 'Time left',
      align: 'right',
      cell: (row) => {
        if (row.status !== 'IN_PROGRESS' || row.timeRemainingSeconds === null)
          return <span className="text-text-muted">—</span>;
        const elapsed = Math.floor((now - computedAtMs) / 1000);
        const remaining = Math.max(0, row.timeRemainingSeconds - elapsed);
        return (
          <span className="font-medium tabular-nums text-text-primary">
            {formatRemainingSeconds(remaining)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <StudentSearch value={query} onChange={setQuery} />
      </div>
      <DataTable
        columns={columns}
        rows={shown}
        getRowId={(row) => row.studentProfileId}
        isLoading={participation.isPending}
        caption="Live attempts"
        emptyState={
          <EmptyState
            icon={Users}
            title={query.trim() ? 'No student matches' : 'No students to track'}
            description={
              query.trim()
                ? `No student matches “${query.trim()}”. Try a different ID or name.`
                : 'Once students start their attempt or have been authorized for a session, their status and time remaining appear here.'
            }
          />
        }
      />
    </div>
  );
}
