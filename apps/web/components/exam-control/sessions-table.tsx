import Link from 'next/link';
import type { ApiComponents } from '@atlas/contracts';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/lib/nav';
import { formatDateTime } from '@/lib/format/date';
import { examControlStudentsPath } from '@/lib/exam-control/navigation';
import { ExamSessionStatusBadge } from './exam-session-status-badge';
import { Monitor } from 'lucide-react';

type ExamSession = ApiComponents['schemas']['ExamSessionResponseDto'];

/**
 * F12 — one row per session, with its own inline Close/Reopen/Manage-
 * students actions. This **is** the multiple-concurrent-open-sessions UX
 * (confirmed design, F12 planning): no global picker gates every action —
 * disambiguation is structural, since each session acts on itself only.
 */
export function SessionsTable({
  examId,
  examStatus,
  sessions,
  basePath,
  onRequestClose,
  onRequestReopen,
  disabled = false,
}: {
  examId: string;
  examStatus: string;
  sessions: ExamSession[];
  basePath: string;
  onRequestClose: (sessionId: string) => void;
  onRequestReopen: (sessionId: string) => void;
  /** Bug fix: the parent screen's `'closed-permanent'` SSE state — every
   * mutating control here (Close/Reopen) must disable too, matching
   * `ExamControlCenterScreen`'s own doc comment. "Manage students" stays
   * enabled — it only navigates, it doesn't mutate. */
  disabled?: boolean;
}) {
  const canClose = useHasPermission('exam.closeNewAttempts');
  const canReopen = useHasPermission('exam.reopen');

  const columns: DataTableColumn<ExamSession>[] = [
    { id: 'type', header: 'Type', cell: (row) => row.sessionType },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => <ExamSessionStatusBadge value={row.status} />,
    },
    {
      id: 'opened',
      header: 'Opened',
      cell: (row) =>
        // Bug fix: there is no `reopenedByMembershipId` column in the
        // schema — a reopened session's `openedByName` is the *original*
        // opener, not necessarily whoever reopened it. Attributing the
        // reopen timestamp to that name was misleading; show the reopen
        // with no by-whom claim instead of a wrong one.
        row.reopenedAt ? (
          <span title={`Originally opened ${formatDateTime(row.openedAt)} by ${row.openedByName}`}>
            Reopened {formatDateTime(row.reopenedAt)}
          </span>
        ) : (
          <span>
            {formatDateTime(row.openedAt)} by {row.openedByName}
          </span>
        ),
    },
    {
      id: 'closed',
      header: 'Closed',
      cell: (row) =>
        row.closedAt ? (
          <span title={formatDateTime(row.closedAt)}>
            {formatDateTime(row.closedAt)} by {row.closedByName}
          </span>
        ) : (
          '—'
        ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right' as const,
      cell: (row) => (
        <div className="flex justify-end gap-2">
          {row.status === 'OPEN' ? (
            // Bug fix: shown only for an OPEN session — `ExamRosterScreen`'s
            // own session resolution only ever accepts an OPEN session id,
            // so a link to any other status silently dropped the id and
            // landed on a confusing "open a session first" empty state.
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${examControlStudentsPath(basePath, examId)}?sessionId=${row.id}`}>
                Manage students
              </Link>
            </Button>
          ) : null}
          {canClose && row.status === 'OPEN' ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => onRequestClose(row.id)}
            >
              Close
            </Button>
          ) : null}
          {canReopen && row.status === 'CLOSED' ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || examStatus !== 'OPEN'}
              title={examStatus !== 'OPEN' ? 'Reopen the exam itself first.' : undefined}
              onClick={() => onRequestReopen(row.id)}
            >
              Reopen
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={sessions}
      getRowId={(row) => row.id}
      caption="Sessions for this exam"
      emptyState={
        <EmptyState
          icon={Monitor}
          title="No sessions opened yet"
          description="Open a session to let students start this exam."
        />
      }
    />
  );
}
