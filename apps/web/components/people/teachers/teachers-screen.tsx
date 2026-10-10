'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Upload, Users2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui/data-table';
import { parsePageSize } from '@/lib/query/page-size';
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
  formalName: string;
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
  const [formOpen, setFormOpen] = useState(false);

  const canManage = useHasPermission('users.teacher.create');
  // F8 — a distinct grant from `users.teacher.create`, even though today's
  // permission table happens to grant both to the same actors.
  const canImport = useHasPermission('users.import.teachers');

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
    pageSize,
    sortBy: sortColumn === 'staffId' || sortColumn === 'lastName' ? sortColumn : null,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : null,
  });

  const rows: TeacherRow[] = teachers.data?.teachers ?? [];
  const pageCount = Math.max(1, Math.ceil((teachers.data?.total ?? 0) / pageSize));

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
            {row.formalName}
          </Link>
          {row.isHod ? <Badge status="info">HOD</Badge> : null}
        </div>
      ),
    },
    { id: 'staffId', header: 'Staff ID', sortable: true, cell: (row) => row.staffId },
    { id: 'status', header: 'Status', cell: (row) => <UserStatusBadge value={row.userStatus} /> },
    {
      // Gap closure: this button alone only ever reached Assignments, not
      // the teacher's own Detail page (Edit/Reset credentials/Deactivate) —
      // that page was reachable only via the subtle name-link above, the
      // same discoverability gap found on Classes/Departments/Students/
      // Question Bank.
      id: 'view',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${basePath}/teachers/${row.teacherProfileId}`}>View</Link>
        </Button>
      ),
    },
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
        <div className="flex gap-2">
          {canImport ? (
            <Button variant="secondary" asChild>
              <Link href={`${basePath}/teachers/import`}>
                <Upload aria-hidden /> Import
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus aria-hidden /> Add teacher
            </Button>
          ) : null}
        </div>
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
          getRowHref={(row) => `${basePath}/teachers/${row.teacherProfileId}`}
          isLoading={teachers.isPending}
          sort={sort}
          onSortChange={(next) =>
            updateFilterParams({ sortBy: next?.columnId ?? null, sortDir: next?.direction ?? null })
          }
          page={page}
          pageCount={pageCount}
          total={teachers.data?.total}
          pageSize={pageSize}
          onPageSizeChange={(next) =>
            updateParams({ size: next === PAGE_SIZE ? null : String(next), page: null })
          }
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
