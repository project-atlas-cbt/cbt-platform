'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ApiComponents } from '@atlas/contracts';
import { Users } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Badge } from '@/components/ui/badge';
import { useExamParticipation } from '@/lib/exam-control/queries';
import { formatDateTime } from '@/lib/format/date';

type LiveAttempt = ApiComponents['schemas']['ExamLiveAttemptRowDto'];
type ParticipationStudent = ApiComponents['schemas']['ParticipationStudentDto'];

type AttemptStatus = 'IN_PROGRESS' | 'NOT_STARTED' | 'SUBMITTED';

type LiveAttemptTableRow = {
  studentProfileId: string;
  studentName: string;
  status: AttemptStatus;
  startedAt: string | null;
  timeRemainingSeconds: number | null;
};

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
        studentProfileId: student.studentProfileId,
        studentName: live.studentName,
        status: 'IN_PROGRESS',
        startedAt: live.startedAt,
        timeRemainingSeconds: live.timeRemainingSeconds,
      });
    } else if (student.rollupStatus === 'ATTENDED') {
      rows.push({
        studentProfileId: student.studentProfileId,
        studentName: student.studentName,
        status: 'SUBMITTED',
        startedAt: null,
        timeRemainingSeconds: null,
      });
    } else {
      rows.push({
        studentProfileId: student.studentProfileId,
        studentName: student.studentName,
        status: 'NOT_STARTED',
        startedAt: null,
        timeRemainingSeconds: null,
      });
    }
  }

  // A live attempt is never hidden, even if its student dropped out of the
  // participation roster by the time this render happened (e.g. a REVOKED
  // participant mid-attempt) — the attempt still exists and is still live.
  for (const live of liveAttempts) {
    if (seen.has(live.studentProfileId)) continue;
    rows.push({
      studentProfileId: live.studentProfileId,
      studentName: live.studentName,
      status: 'IN_PROGRESS',
      startedAt: live.startedAt,
      timeRemainingSeconds: live.timeRemainingSeconds,
    });
  }

  return rows.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.studentName.localeCompare(b.studentName),
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
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(row) => row.studentProfileId}
      isLoading={participation.isPending}
      caption="Live attempts"
      emptyState={
        <EmptyState
          icon={Users}
          title="No students to track"
          description="Once students start their attempt or have been authorized for a session, their status and time remaining appear here."
        />
      }
    />
  );
}
