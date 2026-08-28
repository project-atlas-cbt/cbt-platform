'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHasPermission } from '@/lib/nav';
import { useAcademicsContext, useSessions, useTerms } from '@/lib/academics/queries';
import { useActivateTerm } from '@/lib/onboarding/mutations';
import { useDeleteTerm } from '@/lib/academics/mutations';
import { TermStatusBadge } from '../academic-status-badges';
import { ConfirmActionDialog } from '../confirm-action-dialog';
import { TermForm } from './term-form';

interface TermRow {
  id: string;
  academicSessionId: string;
  name: string;
  sequence: number;
  startDate: string;
  endDate: string;
  status: 'DRAFT' | 'UPCOMING' | 'CURRENT' | 'CLOSED' | 'ARCHIVED';
}

type ConfirmAction = { type: 'activate' | 'delete'; term: TermRow };

/** AC-02 (`05 §7.2`) — terms are session-scoped, so this screen requires a
 * session selection before showing anything; defaults to the current
 * session where one exists. */
export function TermsScreen() {
  const context = useAcademicsContext();
  const sessions = useSessions();
  const canManage = useHasPermission('schoolConfig.term.manage');
  const activateTerm = useActivateTerm();
  const deleteTerm = useDeleteTerm();

  // Derived, not synced via effect (`react-hooks/set-state-in-effect`):
  // defaults to the current session, falling back to the first one, until
  // the user picks a different one explicitly.
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(undefined);
  const sessionId =
    selectedSessionId ?? context.data?.session?.id ?? sessions.data?.sessions[0]?.id;

  const terms = useTerms(sessionId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TermRow | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  if (sessions.isError) {
    return <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />;
  }

  if (!sessions.isPending && (sessions.data?.sessions.length ?? 0) === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No academic sessions yet"
        description="Add an academic session first, on the Sessions tab — terms belong to a session."
      />
    );
  }

  const rows: TermRow[] = terms.data?.terms ?? [];

  const columns: DataTableColumn<TermRow>[] = [
    {
      id: 'name',
      header: 'Term',
      cell: (row) => (
        <span className="font-medium text-text-primary">
          {row.sequence}. {row.name}
        </span>
      ),
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
    { id: 'status', header: 'Status', cell: (row) => <TermStatusBadge value={row.status} /> },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: TermRow) => (
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
                    onSelect={() => setConfirmAction({ type: 'activate', term: row })}
                  >
                    Set as current
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setConfirmAction({ type: 'delete', term: row })}
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-end gap-3">
          <div>
            <Label htmlFor="term-session-select">Session</Label>
            {/* Always a defined `value` (`?? ''`), not a conditional spread:
                `sessionId` is undefined on first render too (both source
                queries are still pending then), so spreading `value` in only
                once it resolves would trip the same uncontrolled-to-
                controlled warning `class-subject-list.tsx` already fixed —
                see that file's own comment for the full reasoning. */}
            <Select value={sessionId ?? ''} onValueChange={setSelectedSessionId}>
              <SelectTrigger id="term-session-select" className="w-56">
                <SelectValue placeholder="Select a session" />
              </SelectTrigger>
              <SelectContent>
                {(sessions.data?.sessions ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {canManage && sessionId ? (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden /> Add term
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        isLoading={terms.isPending}
        emptyState={
          <EmptyState
            title="No terms in this session yet"
            description={
              canManage
                ? 'Add the first term for this session.'
                : 'No terms have been added to this session yet.'
            }
            action={
              canManage && sessionId ? (
                <Button
                  onClick={() => {
                    setEditing(undefined);
                    setFormOpen(true);
                  }}
                >
                  Add term
                </Button>
              ) : undefined
            }
          />
        }
      />

      {sessionId ? (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit term' : 'Add term'}</DialogTitle>
            </DialogHeader>
            <TermForm
              sessionId={sessionId}
              {...(editing ? { term: editing } : {})}
              onSaved={() => setFormOpen(false)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      <ConfirmActionDialog
        open={confirmAction?.type === 'activate'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Set "${confirmAction?.term.name}" as the current term?`}
        body="This closes the currently active term in this session."
        confirmLabel="Set as current"
        onConfirm={async () => {
          if (confirmAction) await activateTerm.mutateAsync(confirmAction.term.id);
        }}
      />
      <ConfirmActionDialog
        open={confirmAction?.type === 'delete'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Delete "${confirmAction?.term.name}"?`}
        body="This permanently removes the term. If any historical exams reference it, deletion will be refused."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmAction) await deleteTerm.mutateAsync(confirmAction.term.id);
        }}
      />
    </div>
  );
}
