'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHasPermission } from '@/lib/nav';
import { useSessions } from '@/lib/academics/queries';
import { useActivateSession } from '@/lib/onboarding/mutations';
import { useArchiveSession, useDeleteSession } from '@/lib/academics/mutations';
import { SessionStatusBadge } from '../academic-status-badges';
import { ConfirmActionDialog } from '../confirm-action-dialog';
import { SessionForm } from './session-form';

interface SessionRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'DRAFT' | 'UPCOMING' | 'CURRENT' | 'CLOSED' | 'ARCHIVED';
}

type ConfirmAction = { type: 'activate' | 'archive' | 'delete'; session: SessionRow };

/** AC-01 (`05 §7.1`) — School Admin/Moderator get full manage; HOD is
 * read-only (`useHasPermission` hides every mutating control, matching F5's
 * established Moderator-view-only pattern, here applied to HOD instead). */
export function SessionsScreen() {
  const sessions = useSessions();
  const canManage = useHasPermission('schoolConfig.session.manage');
  const activateSession = useActivateSession();
  const archiveSession = useArchiveSession();
  const deleteSession = useDeleteSession();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SessionRow | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  if (sessions.isError) {
    return <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />;
  }

  const rows: SessionRow[] = sessions.data?.sessions ?? [];

  const columns: DataTableColumn<SessionRow>[] = [
    {
      id: 'name',
      header: 'Session',
      cell: (row) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    {
      id: 'dates',
      header: 'Dates',
      cell: (row) => (
        <span className="text-text-secondary">
          {row.startDate} – {row.endDate}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => <SessionStatusBadge value={row.status} />,
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: SessionRow) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={row.status !== 'DRAFT' && row.status !== 'UPCOMING'}
                    onSelect={() => {
                      setEditing(row);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={row.status === 'CURRENT' || row.status === 'ARCHIVED'}
                    onSelect={() => setConfirmAction({ type: 'activate', session: row })}
                  >
                    Set as current
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={row.status === 'ARCHIVED'}
                    onSelect={() => setConfirmAction({ type: 'archive', session: row })}
                  >
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setConfirmAction({ type: 'delete', session: row })}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Academic sessions</h2>
          <p className="text-sm text-text-muted">
            Exactly one session may be current at a time — activating a new one closes the previous
            session and its current term.
          </p>
        </div>
        {canManage ? (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden /> Add session
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        isLoading={sessions.isPending}
        emptyState={
          <EmptyState
            icon={CalendarRange}
            title="No academic sessions yet"
            description={
              canManage
                ? 'Add your school’s first academic session to get started.'
                : 'No academic sessions have been created for this school yet.'
            }
            action={
              canManage ? (
                <Button
                  onClick={() => {
                    setEditing(undefined);
                    setFormOpen(true);
                  }}
                >
                  Add session
                </Button>
              ) : undefined
            }
          />
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit session' : 'Add session'}</DialogTitle>
          </DialogHeader>
          <SessionForm
            {...(editing ? { session: editing } : {})}
            onSaved={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmAction?.type === 'activate'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Set "${confirmAction?.session.name}" as the current session?`}
        body="This closes the currently active session (and its current term, if any). This cannot be undone from here."
        confirmLabel="Set as current"
        onConfirm={async () => {
          if (confirmAction) await activateSession.mutateAsync(confirmAction.session.id);
        }}
      />
      <ConfirmActionDialog
        open={confirmAction?.type === 'archive'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Archive "${confirmAction?.session.name}"?`}
        body="Archiving preserves all historical records for this session — it just removes it from active use."
        confirmLabel="Archive"
        onConfirm={async () => {
          if (confirmAction) await archiveSession.mutateAsync(confirmAction.session.id);
        }}
      />
      <ConfirmActionDialog
        open={confirmAction?.type === 'delete'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Delete "${confirmAction?.session.name}"?`}
        body="This permanently removes the session. If anything (terms, classes, offerings, HOD assignments) still references it, deletion will be refused — archive it instead."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmAction) await deleteSession.mutateAsync(confirmAction.session.id);
        }}
      />
    </div>
  );
}
