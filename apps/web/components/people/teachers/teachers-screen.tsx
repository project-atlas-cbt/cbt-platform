'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Users2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useHasPermission } from '@/lib/nav';
import { useTeachersPaginated } from '@/lib/people/queries';
import { UserStatusBadge } from '../people-status-badges';
import { TeacherForm } from './teacher-form';

const PAGE_SIZE = 25;

interface TeacherRow {
  teacherProfileId: string;
  displayName: string;
  staffId: string;
  userStatus: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  isHod: boolean;
}

/** `05 §11.1`. Search/sort/paginate all server-side (F7 gap-closure). */
export function TeachersScreen({ basePath }: { basePath: string }) {
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

  const canManage = useHasPermission('users.teacher.create');

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${basePath}/teachers?${params.toString()}`);
  }

  function updateFilterParams(next: Record<string, string | null>) {
    updateParams({ ...next, page: null });
  }

  const teachers = useTeachersPaginated({
    q: search,
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortColumn === 'staffId' || sortColumn === 'lastName' ? sortColumn : null,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : null,
  });

  const rows: TeacherRow[] = teachers.data?.teachers ?? [];
  const pageCount = Math.max(1, Math.ceil((teachers.data?.total ?? 0) / PAGE_SIZE));

  const columns: DataTableColumn<TeacherRow>[] = [
    {
      id: 'lastName',
      header: 'Name',
      sortable: true,
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Link
            href={`${basePath}/teachers/${row.teacherProfileId}`}
            className="font-medium text-text-primary hover:underline"
          >
            {row.displayName}
          </Link>
          {row.isHod ? <Badge status="info">HOD</Badge> : null}
        </div>
      ),
    },
    { id: 'staffId', header: 'Staff ID', sortable: true, cell: (row) => row.staffId },
    { id: 'status', header: 'Status', cell: (row) => <UserStatusBadge value={row.userStatus} /> },
    {
      id: 'assignments',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${basePath}/teachers/${row.teacherProfileId}/assignments`}>Assignments</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Teachers</h2>
        {canManage ? (
          <Button onClick={() => setFormOpen(true)}>
            <Plus aria-hidden /> Add teacher
          </Button>
        ) : null}
      </div>

      <div>
        <Label htmlFor="teacher-search">Search</Label>
        <Input
          id="teacher-search"
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

      {teachers.isError ? (
        <ErrorState error={teachers.error} onRetry={() => void teachers.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.teacherProfileId}
          isLoading={teachers.isPending}
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
                icon={Users2}
                title="No teachers yet"
                description={
                  canManage
                    ? 'Add your school’s first teacher.'
                    : 'No teachers have been added to this school yet.'
                }
                action={
                  canManage ? (
                    <Button onClick={() => setFormOpen(true)}>Add teacher</Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState icon={Users2} title="No teachers match this search" />
            )
          }
        />
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add teacher</DialogTitle>
          </DialogHeader>
          <TeacherForm onSaved={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
