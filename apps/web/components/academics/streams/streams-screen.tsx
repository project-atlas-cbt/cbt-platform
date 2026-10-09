'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal, Waypoints } from 'lucide-react';
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
import { useStreams } from '@/lib/academics/queries';
import { useDeleteStream, useUpdateStream } from '@/lib/academics/mutations';
import { StreamStatusBadge } from '../academic-status-badges';
import { ConfirmActionDialog } from '../confirm-action-dialog';
import { StreamForm } from './stream-form';

interface StreamRow {
  id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
  classCount: number;
  studentCount: number;
}

type ConfirmAction = { type: 'deactivate' | 'delete'; stream: StreamRow };

/** ADR-0038 — student streams (Science, Business, Humanities). A stream is a
 * group of students, not of staff: classes default new students into one,
 * and a subject offered to a stream registers every student in it. Staff
 * departments, which decide who reviews questions, are a separate list. */
export function StreamsScreen() {
  const streams = useStreams();
  const canManage = useHasPermission('schoolConfig.class.manage');
  const deleteStream = useDeleteStream();
  const updateStream = useUpdateStream();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StreamRow | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  if (streams.isError) {
    return <ErrorState error={streams.error} onRetry={() => void streams.refetch()} />;
  }

  const rows: StreamRow[] = streams.data?.streams ?? [];

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  const columns: DataTableColumn<StreamRow>[] = [
    {
      id: 'name',
      header: 'Stream',
      cell: (row) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    { id: 'code', header: 'Code', cell: (row) => row.code },
    {
      id: 'classes',
      header: 'Classes',
      align: 'right' as const,
      cell: (row) => <span className="tabular-nums">{row.classCount}</span>,
    },
    {
      id: 'students',
      header: 'Students this session',
      align: 'right' as const,
      cell: (row) => <span className="tabular-nums">{row.studentCount}</span>,
    },
    { id: 'status', header: 'Status', cell: (row) => <StreamStatusBadge value={row.status} /> },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: StreamRow) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing(row);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  {row.status === 'ACTIVE' ? (
                    <DropdownMenuItem
                      onSelect={() => setConfirmAction({ type: 'deactivate', stream: row })}
                    >
                      Deactivate
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() => updateStream.mutate({ id: row.id, status: 'ACTIVE' })}
                    >
                      Reactivate
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => setConfirmAction({ type: 'delete', stream: row })}
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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-text-primary">Streams</h2>
          <p className="max-w-prose text-sm text-text-secondary">
            Groups of students who take the same set of subjects, such as Science or Business. A
            subject offered to a stream registers every student in it. Departments are for staff and
            question review, and are set up separately.
          </p>
        </div>
        {canManage ? (
          <Button onClick={openCreate} className="shrink-0">
            <Plus aria-hidden /> Add stream
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        isLoading={streams.isPending}
        emptyState={
          <EmptyState
            icon={Waypoints}
            title="No streams yet"
            description={
              canManage
                ? 'Add streams if your senior classes split students into Science, Business or Humanities. Junior classes usually need none.'
                : 'This school has not set up any streams.'
            }
            action={canManage ? <Button onClick={openCreate}>Add stream</Button> : undefined}
          />
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit stream' : 'Add stream'}</DialogTitle>
          </DialogHeader>
          <StreamForm
            {...(editing ? { stream: editing } : {})}
            onSaved={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmAction?.type === 'deactivate'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Deactivate "${confirmAction?.stream.name}"?`}
        body="Students already in this stream stay in it and keep their subjects. It can no longer be picked for a class, a student or a subject until you reactivate it."
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (confirmAction)
            await updateStream.mutateAsync({ id: confirmAction.stream.id, status: 'INACTIVE' });
        }}
      />
      <ConfirmActionDialog
        open={confirmAction?.type === 'delete'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Delete "${confirmAction?.stream.name}"?`}
        body="This permanently removes the stream. If any class, student or subject still uses it, deletion will be refused. Deactivate it instead."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmAction) await deleteStream.mutateAsync(confirmAction.stream.id);
        }}
      />
    </div>
  );
}
