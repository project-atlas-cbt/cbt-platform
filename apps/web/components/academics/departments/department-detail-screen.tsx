'use client';

import { useState } from 'react';
import { Pencil, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHasPermission } from '@/lib/nav';
import { useDepartment, useDepartmentHodAssignments, useHods } from '@/lib/academics/queries';
import { DepartmentStatusBadge } from '../academic-status-badges';
import { DepartmentForm } from './department-form';

/** AC-03 detail. The "Current HOD" card is read-only everywhere in F6
 * (confirmed decision #4 — assign/reassign is F7's job, since
 * `assignments.hodToDepartment` is already categorized under People in the
 * nav model). For an HOD viewer specifically, `users.hod.view` is denied
 * (confirmed decision #2) so the name can't be resolved — a name-less
 * "HOD position filled" status is shown instead, never a broken lookup or a
 * silently-omitted card. */
export function DepartmentDetailScreen({ departmentId }: { departmentId: string }) {
  const department = useDepartment(departmentId);
  const hodAssignments = useDepartmentHodAssignments(departmentId);
  const canManage = useHasPermission('schoolConfig.department.manage');
  const canSeeHodNames = useHasPermission('users.hod.view');
  const hods = useHods({ enabled: canSeeHodNames });
  const [editOpen, setEditOpen] = useState(false);

  if (department.isPending) return <Skeleton className="h-48 w-full" />;
  if (department.isError) {
    return <ErrorState error={department.error} onRetry={() => void department.refetch()} />;
  }

  const activeAssignment = (hodAssignments.data?.assignments ?? []).find(
    (a) => a.status === 'ACTIVE',
  );
  const hodName =
    canSeeHodNames && activeAssignment
      ? hods.data?.hods.find((h) => h.membershipId === activeAssignment.membershipId)?.displayName
      : undefined;

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{department.data.name}</h2>
          <p className="text-sm text-text-muted">Code: {department.data.code}</p>
        </div>
        <div className="flex items-center gap-2">
          <DepartmentStatusBadge value={department.data.status} />
          {canManage ? (
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-border p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
          <UserCircle className="size-4 text-text-muted" aria-hidden /> Current Head of Department
        </h3>
        {hodAssignments.isPending ? (
          <Skeleton className="h-5 w-40" />
        ) : activeAssignment ? (
          <p className="text-sm text-text-secondary">
            {hodName ?? 'HOD position filled'}
            {!canSeeHodNames ? (
              <span className="ml-2 text-xs text-text-muted">(manage from People)</span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-text-muted">
            No one is currently assigned as HOD of this department.
          </p>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit department</DialogTitle>
          </DialogHeader>
          <DepartmentForm department={department.data} onSaved={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
