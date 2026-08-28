'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal, BookOpen } from 'lucide-react';
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
import { useDepartments, useSubjects } from '@/lib/academics/queries';
import { useDeactivateSubject, useDeleteSubject } from '@/lib/academics/mutations';
import { SubjectStatusBadge } from '../academic-status-badges';
import { ConfirmActionDialog } from '../confirm-action-dialog';
import { SubjectForm } from './subject-form';

interface SubjectRow {
  id: string;
  name: string;
  code: string;
  departmentId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

type ConfirmAction = { type: 'deactivate' | 'delete'; subject: SubjectRow };

/** AC-05 (`05 §7.5`). "A subject being deactivated must not break historical
 * exams" (DoD item 5) — deactivation never touches historical `Exam`
 * references (a subject reference is by id, never removed); the warning
 * here is a static explanation shown before confirming, matching
 * Departments' own precedent (no dependents count exists for deactivate). */
export function SubjectsScreen() {
  const subjects = useSubjects();
  const departments = useDepartments();
  const canManage = useHasPermission('schoolConfig.subject.manage');
  const deactivateSubject = useDeactivateSubject();
  const deleteSubject = useDeleteSubject();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectRow | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  if (subjects.isError) {
    return <ErrorState error={subjects.error} onRetry={() => void subjects.refetch()} />;
  }

  const departmentName = (id: string | null) =>
    id ? (departments.data?.departments.find((d) => d.id === id)?.name ?? '—') : '—';

  const rows: SubjectRow[] = subjects.data?.subjects ?? [];

  const columns: DataTableColumn<SubjectRow>[] = [
    {
      id: 'name',
      header: 'Subject',
      cell: (row) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    { id: 'code', header: 'Code', cell: (row) => row.code },
    { id: 'department', header: 'Department', cell: (row) => departmentName(row.departmentId) },
    { id: 'status', header: 'Status', cell: (row) => <SubjectStatusBadge value={row.status} /> },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: SubjectRow) => (
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
                      onSelect={() => setConfirmAction({ type: 'deactivate', subject: row })}
                    >
                      Deactivate
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() => setConfirmAction({ type: 'delete', subject: row })}
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
        <h2 className="text-base font-semibold text-text-primary">Subjects</h2>
        {canManage ? (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden /> Add subject
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        isLoading={subjects.isPending}
        emptyState={
          <EmptyState
            icon={BookOpen}
            title="No subjects yet"
            description={
              canManage
                ? 'Add your school’s first subject.'
                : 'No subjects have been created for this school yet.'
            }
            action={
              canManage ? (
                <Button
                  onClick={() => {
                    setEditing(undefined);
                    setFormOpen(true);
                  }}
                >
                  Add subject
                </Button>
              ) : undefined
            }
          />
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit subject' : 'Add subject'}</DialogTitle>
          </DialogHeader>
          <SubjectForm
            {...(editing ? { subject: editing } : {})}
            onSaved={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmAction?.type === 'deactivate'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Deactivate "${confirmAction?.subject.name}"?`}
        body="Deactivating hides this subject from new offerings — every class offering and historical exam that already references it stays intact."
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (confirmAction) await deactivateSubject.mutateAsync(confirmAction.subject.id);
        }}
      />
      <ConfirmActionDialog
        open={confirmAction?.type === 'delete'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Delete "${confirmAction?.subject.name}"?`}
        body="This permanently removes the subject. If any class offering or exam still references it, deletion will be refused — deactivate it instead."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmAction) await deleteSubject.mutateAsync(confirmAction.subject.id);
        }}
      />
    </div>
  );
}
