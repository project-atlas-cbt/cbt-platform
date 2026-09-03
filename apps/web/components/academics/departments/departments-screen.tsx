'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, MoreHorizontal, Building2 } from 'lucide-react';
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
import { useDepartments } from '@/lib/academics/queries';
import { useDeactivateDepartment } from '@/lib/onboarding/mutations';
import { useDeleteDepartment } from '@/lib/academics/mutations';
import { DepartmentStatusBadge } from '../academic-status-badges';
import { ConfirmActionDialog } from '../confirm-action-dialog';
import { DepartmentForm } from './department-form';

interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
}

type ConfirmAction = { type: 'deactivate' | 'delete'; department: DepartmentRow };

/** AC-03 (`05 §7.3`) — a department with historical records cannot be
 * destructively deleted (DoD item 6), but deactivation is always allowed
 * (DoD item 5's "explains the consequence" is a static warning here, since
 * the backend has nothing to fetch a dependents count against for
 * deactivate — see `department.service.ts`). */
export function DepartmentsScreen({ basePath }: { basePath: string }) {
  const departments = useDepartments();
  const canManage = useHasPermission('schoolConfig.department.manage');
  const deactivateDepartment = useDeactivateDepartment();
  const deleteDepartment = useDeleteDepartment();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentRow | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  if (departments.isError) {
    return <ErrorState error={departments.error} onRetry={() => void departments.refetch()} />;
  }

  const rows: DepartmentRow[] = departments.data?.departments ?? [];

  const columns: DataTableColumn<DepartmentRow>[] = [
    {
      id: 'name',
      header: 'Department',
      cell: (row) => (
        <Link
          href={`${basePath}/departments/${row.id}`}
          className="font-medium text-text-primary hover:underline"
        >
          {row.name}
        </Link>
      ),
    },
    { id: 'code', header: 'Code', cell: (row) => row.code },
    { id: 'status', header: 'Status', cell: (row) => <DepartmentStatusBadge value={row.status} /> },
    {
      id: 'view',
      header: '',
      align: 'right' as const,
      // Same discoverability gap as `classes-screen.tsx` (found in the same
      // pass, identical shape — see that file's comment): the name-link
      // alone reads as plain text with only the "..." menu looking
      // interactive. Mirrors `teachers-screen.tsx`'s "Assignments" button.
      cell: (row: DepartmentRow) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${basePath}/departments/${row.id}`}>View</Link>
        </Button>
      ),
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: DepartmentRow) => (
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
                      onSelect={() => setConfirmAction({ type: 'deactivate', department: row })}
                    >
                      Deactivate
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onSelect={() => setConfirmAction({ type: 'delete', department: row })}
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
        <h2 className="text-base font-semibold text-text-primary">Departments</h2>
        {canManage ? (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden /> Add department
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        isLoading={departments.isPending}
        emptyState={
          <EmptyState
            icon={Building2}
            title="No departments yet"
            description={
              canManage
                ? 'Add your school’s first department.'
                : 'No departments have been created for this school yet.'
            }
            action={
              canManage ? (
                <Button
                  onClick={() => {
                    setEditing(undefined);
                    setFormOpen(true);
                  }}
                >
                  Add department
                </Button>
              ) : undefined
            }
          />
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit department' : 'Add department'}</DialogTitle>
          </DialogHeader>
          <DepartmentForm
            {...(editing ? { department: editing } : {})}
            onSaved={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmAction?.type === 'deactivate'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Deactivate "${confirmAction?.department.name}"?`}
        body="Deactivating hides this department from new assignments — every subject, class, and HOD assignment that already references it stays intact, and its history is preserved."
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (confirmAction) await deactivateDepartment.mutateAsync(confirmAction.department.id);
        }}
      />
      <ConfirmActionDialog
        open={confirmAction?.type === 'delete'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Delete "${confirmAction?.department.name}"?`}
        body="This permanently removes the department. If any subject, class, or HOD assignment still references it, deletion will be refused — deactivate it instead."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmAction) await deleteDepartment.mutateAsync(confirmAction.department.id);
        }}
      />
    </div>
  );
}
