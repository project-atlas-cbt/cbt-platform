'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, MoreHorizontal, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHasPermission } from '@/lib/nav';
import { useModeratorsPaginated } from '@/lib/people/queries';
import { useRemoveModerator } from '@/lib/people/mutations';
import { UserStatusBadge } from '../people-status-badges';
import { ConfirmActionDialog } from '@/components/academics/confirm-action-dialog';
import { ModeratorForm } from './moderator-form';

const PAGE_SIZE = 25;

interface ModeratorRow {
  membershipId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  loginIdentifier: string;
  email: string | null;
  userStatus: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
}

/**
 * `05 §14` — School Admin only. `users.moderator.view` is denied to
 * Moderator itself (05 §14: "should not automatically inherit academic
 * approval privileges"), so a Moderator viewer never reaches this screen —
 * proven directly by `PeopleTabs` hiding the tab and `nav-model.ts`'s own
 * grant, but this screen still gates every action defensively too.
 */
export function ModeratorsScreen({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const sortColumn = searchParams.get('sortBy');
  const sortDir = searchParams.get('sortDir');
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const sort = useMemo<DataTableSort | null>(
    () =>
      sortColumn && (sortDir === 'asc' || sortDir === 'desc')
        ? { columnId: sortColumn, direction: sortDir }
        : null,
    [sortColumn, sortDir],
  );

  const [searchInput, setSearchInput] = useState(search);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModeratorRow | undefined>(undefined);
  const [removing, setRemoving] = useState<ModeratorRow | null>(null);

  const canManage = useHasPermission('users.moderator.create');
  const removeModerator = useRemoveModerator();

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${basePath}/moderators?${params.toString()}`);
  }
  function updateFilterParams(next: Record<string, string | null>) {
    updateParams({ ...next, page: null });
  }

  const moderators = useModeratorsPaginated({
    q: search,
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortColumn === 'loginIdentifier' || sortColumn === 'lastName' ? sortColumn : null,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : null,
  });

  const rows: ModeratorRow[] = moderators.data?.moderators ?? [];
  const pageCount = Math.max(1, Math.ceil((moderators.data?.total ?? 0) / PAGE_SIZE));

  const columns: DataTableColumn<ModeratorRow>[] = [
    { id: 'lastName', header: 'Name', sortable: true, cell: (row) => row.displayName },
    {
      id: 'loginIdentifier',
      header: 'Login ID',
      sortable: true,
      cell: (row) => row.loginIdentifier,
    },
    { id: 'status', header: 'Status', cell: (row) => <UserStatusBadge value={row.userStatus} /> },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right' as const,
            cell: (row: ModeratorRow) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${row.displayName}`}>
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
                  <DropdownMenuItem onSelect={() => setRemoving(row)}>
                    Remove access
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
        <h2 className="text-base font-semibold text-text-primary">Moderators</h2>
        {canManage ? (
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden /> Add moderator
          </Button>
        ) : null}
      </div>

      <div>
        <Label htmlFor="moderator-search">Search</Label>
        <Input
          id="moderator-search"
          className="w-64"
          placeholder="Name or login ID"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onBlur={() => updateFilterParams({ q: searchInput || null })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') updateFilterParams({ q: searchInput || null });
          }}
        />
      </div>

      {moderators.isError ? (
        <ErrorState error={moderators.error} onRetry={() => void moderators.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.membershipId}
          isLoading={moderators.isPending}
          sort={sort}
          onSortChange={(next) =>
            updateFilterParams({ sortBy: next?.columnId ?? null, sortDir: next?.direction ?? null })
          }
          page={page}
          pageCount={pageCount}
          onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : null })}
          emptyState={
            !search ? (
              <EmptyState
                icon={UserCog}
                title="No moderators yet"
                description={
                  canManage
                    ? 'Add your school’s first moderator.'
                    : 'No moderators have been added to this school yet.'
                }
                action={
                  canManage ? (
                    <Button onClick={() => setFormOpen(true)}>Add moderator</Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState icon={UserCog} title="No moderators match this search" />
            )
          }
        />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit moderator' : 'Add moderator'}</DialogTitle>
          </DialogHeader>
          <ModeratorForm
            {...(editing ? { moderator: editing } : {})}
            onSaved={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Remove ${removing.displayName}'s access?` : ''}
        body="This ends their Moderator role and deactivates their account. Nothing they've reviewed or approved is affected."
        confirmLabel="Remove access"
        destructive
        onConfirm={async () => {
          if (removing) await removeModerator.mutateAsync(removing.membershipId);
        }}
      />
    </div>
  );
}
