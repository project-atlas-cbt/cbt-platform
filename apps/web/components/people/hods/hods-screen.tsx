'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, MoreHorizontal, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui/data-table';
import { parsePageSize } from '@/lib/query/page-size';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHasPermission } from '@/lib/nav';
import { useAcademicsContext } from '@/lib/academics/queries';
import { useHodsPaginated } from '@/lib/people/queries';
import { useRemoveHod, useResetHodCredentials } from '@/lib/people/mutations';
import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';
import { HodPromoteDialog } from './hod-promote-dialog';
import { HodDepartmentDialog } from './hod-department-dialog';
import { HodEditDialog } from './hod-edit-dialog';
import { TeacherInvitationSentDialog } from '../teachers/teacher-invitation-sent-dialog';

const PAGE_SIZE = 25;

interface HodRow {
  membershipId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string;
  formalName: string;
  staffId: string;
  departmentId: string | null;
  departmentName: string | null;
}

type DialogState =
  | { type: 'department'; hod: HodRow }
  | { type: 'edit'; hod: HodRow }
  | { type: 'reset'; hod: HodRow }
  | { type: 'remove'; hod: HodRow }
  | null;

/** `05 §13`. HOD assign/reassign, deferred from F6 (confirmed decision —
 * "F7's job"). Search/sort/paginate all server-side (F7 gap-closure). */
export function HodsScreen({ basePath: _basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const sortColumn = searchParams.get('sortBy');
  const sortDir = searchParams.get('sortDir');
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = parsePageSize(searchParams.get('size'), PAGE_SIZE);
  const sort = useMemo<DataTableSort>(
    () =>
      sortColumn && (sortDir === 'asc' || sortDir === 'desc')
        ? { columnId: sortColumn, direction: sortDir }
        : // Owner decision 2026-10-09: lists open A to Z by surname.
          { columnId: 'lastName', direction: 'asc' },
    [sortColumn, sortDir],
  );

  const [searchInput, setSearchInput] = useState(search);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const canPromote = useHasPermission('users.hod.create');
  const canEdit = useHasPermission('users.hod.edit');
  const canAssign = useHasPermission('assignments.hodToDepartment');
  const canReset = useHasPermission('users.hod.resetCredentials');
  const canRemove = useHasPermission('users.hod.remove');

  const removeHod = useRemoveHod();
  const resetCredentials = useResetHodCredentials();
  const context = useAcademicsContext();

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${_basePath}/hods?${params.toString()}`);
  }
  function updateFilterParams(next: Record<string, string | null>) {
    updateParams({ ...next, page: null });
  }

  const hods = useHodsPaginated({
    q: search,
    page,
    pageSize,
    sortBy: sortColumn === 'staffId' || sortColumn === 'lastName' ? sortColumn : null,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : null,
  });

  const rows: HodRow[] = hods.data?.hods ?? [];
  const pageCount = Math.max(1, Math.ceil((hods.data?.total ?? 0) / pageSize));
  const canManageAny = canEdit || canAssign || canReset || canRemove;

  const columns: DataTableColumn<HodRow>[] = [
    { id: 'lastName', header: 'Name', sortable: true, cell: (row) => row.formalName },
    { id: 'staffId', header: 'Staff ID', sortable: true, cell: (row) => row.staffId },
    { id: 'department', header: 'Department', cell: (row) => row.departmentName ?? '—' },
    ...(canManageAny
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: HodRow) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${row.formalName}`}>
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canAssign ? (
                    <DropdownMenuItem onSelect={() => setDialog({ type: 'department', hod: row })}>
                      {row.departmentId ? 'Change department' : 'Assign department'}
                    </DropdownMenuItem>
                  ) : null}
                  {canEdit ? (
                    <DropdownMenuItem onSelect={() => setDialog({ type: 'edit', hod: row })}>
                      Edit
                    </DropdownMenuItem>
                  ) : null}
                  {canReset ? (
                    <DropdownMenuItem onSelect={() => setDialog({ type: 'reset', hod: row })}>
                      Reset credentials
                    </DropdownMenuItem>
                  ) : null}
                  {canRemove ? (
                    <DropdownMenuItem onSelect={() => setDialog({ type: 'remove', hod: row })}>
                      Remove HOD standing
                    </DropdownMenuItem>
                  ) : null}
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
        <h2 className="text-base font-semibold text-text-primary">Heads of Department</h2>
        {canPromote ? (
          <Button onClick={() => setPromoteOpen(true)}>
            <Plus aria-hidden /> Promote teacher to HOD
          </Button>
        ) : null}
      </div>

      <div>
        <Label htmlFor="hod-search">Search</Label>
        <Input
          id="hod-search"
          className="w-64"
          placeholder="Name or staff ID"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onBlur={() => updateFilterParams({ q: searchInput || null })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') updateFilterParams({ q: searchInput || null });
          }}
        />
      </div>

      {hods.isError ? (
        <ErrorState error={hods.error} onRetry={() => void hods.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.membershipId}
          isLoading={hods.isPending}
          sort={sort}
          onSortChange={(next) =>
            updateFilterParams({ sortBy: next?.columnId ?? null, sortDir: next?.direction ?? null })
          }
          page={page}
          pageCount={pageCount}
          total={hods.data?.total}
          pageSize={pageSize}
          onPageSizeChange={(next) =>
            updateParams({ size: next === PAGE_SIZE ? null : String(next), page: null })
          }
          onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : null })}
          emptyState={
            !search ? (
              <EmptyState
                icon={ShieldCheck}
                title="No HODs yet"
                description={
                  canPromote
                    ? 'Promote an existing teacher to Head of Department.'
                    : 'No teacher has been promoted to Head of Department yet.'
                }
                action={
                  canPromote ? (
                    <Button onClick={() => setPromoteOpen(true)}>Promote teacher</Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState icon={ShieldCheck} title="No HODs match this search" />
            )
          }
        />
      )}

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote teacher to HOD</DialogTitle>
          </DialogHeader>
          <HodPromoteDialog
            onSaved={() => setPromoteOpen(false)}
            {...(context.data?.session?.id ? { academicSessionId: context.data.session.id } : {})}
          />
        </DialogContent>
      </Dialog>

      {dialog?.type === 'department' ? (
        <HodDepartmentDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          membershipId={dialog.hod.membershipId}
          currentDepartmentId={dialog.hod.departmentId}
        />
      ) : null}

      {dialog?.type === 'edit' ? (
        <HodEditDialog open onOpenChange={(open) => !open && setDialog(null)} hod={dialog.hod} />
      ) : null}

      <TeacherInvitationSentDialog
        open={dialog?.type === 'reset'}
        onOpenChange={(open) => !open && setDialog(null)}
        resetFn={(id) => resetCredentials.mutateAsync(id)}
        entityId={dialog?.type === 'reset' ? dialog.hod.membershipId : ''}
        entityLabel="HOD"
      />

      <ConfirmActionDialog
        open={dialog?.type === 'remove'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.type === 'remove' ? `Remove ${dialog.hod.displayName}'s HOD standing?` : ''}
        body="This person reverts to a plain teacher. Nothing they authored or approved as HOD is affected — their prior department assignment history stays intact."
        confirmLabel="Remove HOD standing"
        destructive
        onConfirm={async () => {
          if (dialog?.type === 'remove') await removeHod.mutateAsync(dialog.hod.membershipId);
        }}
      />
    </div>
  );
}
