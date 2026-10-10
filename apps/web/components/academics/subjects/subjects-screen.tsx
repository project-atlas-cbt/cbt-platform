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
import { useDepartments, useSubjectChoiceGroups, useSubjects } from '@/lib/academics/queries';
import { useDeactivateSubject, useDeleteSubject } from '@/lib/academics/mutations';
import { SubjectStatusBadge } from '../academic-status-badges';
import { ConfirmActionDialog } from '../confirm-action-dialog';
import { StandardSetupDialog } from '../standard-setup/standard-setup-dialog';
import { ChoiceGroupsPanel } from './choice-groups-panel';
import { SubjectForm } from './subject-form';

interface SubjectRow {
  id: string;
  name: string;
  code: string;
  departmentId: string | null;
  choiceGroupId: string | null;
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
  const choiceGroups = useSubjectChoiceGroups();
  const canManage = useHasPermission('schoolConfig.subject.manage');
  const deactivateSubject = useDeactivateSubject();
  const deleteSubject = useDeleteSubject();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectRow | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [standardOpen, setStandardOpen] = useState(false);

  if (subjects.isError) {
    return <ErrorState error={subjects.error} onRetry={() => void subjects.refetch()} />;
  }

  const departmentName = (id: string | null) =>
    id ? (departments.data?.departments.find((d) => d.id === id)?.name ?? '—') : '—';

  const rows: SubjectRow[] = subjects.data?.subjects ?? [];
  const withoutDepartment = rows.filter((r) => r.departmentId === null && r.status === 'ACTIVE');

  const columns: DataTableColumn<SubjectRow>[] = [
    {
      id: 'name',
      header: 'Subject',
      cell: (row) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    { id: 'code', header: 'Code', cell: (row) => row.code },
    {
      id: 'department',
      header: 'Department (HOD review)',
      cell: (row) =>
        row.departmentId ? (
          departmentName(row.departmentId)
        ) : (
          <span
            className="text-warning-subtle-foreground"
            title="The School Admin reviews its questions, and no HOD sees its exams or results"
          >
            None set
          </span>
        ),
    },
    {
      id: 'choiceGroup',
      header: 'Choice group',
      cell: (row) =>
        row.choiceGroupId
          ? (choiceGroups.data?.choiceGroups.find((g) => g.id === row.choiceGroupId)?.name ?? '—')
          : '—',
    },
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Subjects</h2>
          <p className="max-w-prose text-sm text-text-secondary">
            A subject&apos;s department decides which HOD reviews its questions, not who takes it.
            Class offerings decide who takes it.
          </p>
        </div>
        {canManage ? (
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => setStandardOpen(true)}>
              Use standard setup
            </Button>
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus aria-hidden /> Add subject
            </Button>
          </div>
        ) : null}
      </div>

      {withoutDepartment.length > 0 ? (
        <div
          role="status"
          className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground"
        >
          {withoutDepartment.length === 1
            ? `${withoutDepartment[0]!.name} has no department, so the School Admin reviews its questions instead of an HOD, and no HOD sees its exams or results.`
            : `${withoutDepartment.length} subjects have no department (${withoutDepartment
                .map((r) => r.name)
                .join(
                  ', ',
                )}), so the School Admin reviews their questions instead of an HOD, and no HOD sees their exams or results.`}{' '}
          Give each one a department, even one every stream takes.
        </div>
      ) : null}

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

      <ChoiceGroupsPanel />

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

      <StandardSetupDialog open={standardOpen} onOpenChange={setStandardOpen} />

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
