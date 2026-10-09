'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, School as SchoolIcon } from 'lucide-react';
import { SCHOOL_STATUSES, type SchoolStatus } from '@atlas/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui/data-table';
import { SchoolStatusBadge } from '@/components/platform/status-badges';
import { useSchools } from '@/lib/platform/queries';

interface SchoolRow {
  id: string;
  name: string;
  subdomain: string;
  status: SchoolStatus;
  studentCount: number;
  createdAt: string;
}

const STATUS_LABEL: Record<SchoolStatus, string> = {
  PROVISIONAL: 'Provisional',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  EXPIRED: 'Expired',
  DEACTIVATED: 'Deactivated',
};

// Matches SchoolsAdminService's own DEFAULT_PAGE_SIZE — no page-size
// selector exists anywhere in the product yet, so this is a fixed constant
// on both sides rather than something the API needs to echo back.
const PAGE_SIZE = 25;

/**
 * SA-02 (`05 §3.1`). Search, status filter, sort, and pagination are all
 * server-side (F3 gap closure — `frontend-roadmap.md`'s F3 DoD item 2
 * originally shipped with pagination as an honestly-flagged partial item).
 * `studentCount` is displayed but not sortable: it isn't a `School` column
 * (it's a per-school count of RLS-protected `RoleAssignment` rows), so a
 * single cross-school `ORDER BY` on it isn't available without bypassing
 * tenant isolation — see `SchoolsAdminService.list`'s own doc comment.
 * Filter/search/sort/page state is mirrored into the URL (roadmap's own
 * State management requirement) so this view is shareable/back-navigable.
 */
export default function SchoolsListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = (searchParams.get('status')?.split(',').filter(Boolean) ??
    []) as SchoolStatus[];
  const search = searchParams.get('q') ?? '';
  const sortColumn = searchParams.get('sortBy');
  const sortDir = searchParams.get('sortDir');
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  // Memoized so its identity is stable across renders unless the underlying
  // params actually change.
  const sort = useMemo<DataTableSort | null>(
    () =>
      sortColumn && (sortDir === 'asc' || sortDir === 'desc')
        ? { columnId: sortColumn, direction: sortDir }
        : null,
    [sortColumn, sortDir],
  );

  const [searchInput, setSearchInput] = useState(search);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`/admin/schools?${params.toString()}`);
  }

  // Narrowing the result set (status/search/sort) can leave the view on a
  // now out-of-range page — always reset to page 1 alongside those changes.
  function updateFilterParams(next: Record<string, string | null>) {
    updateParams({ ...next, page: null });
  }

  function toggleStatus(status: SchoolStatus) {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    updateFilterParams({ status: next.join(',') || null });
  }

  const schools = useSchools({
    status: statusFilter,
    q: search,
    page,
    sortBy: sortColumn,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : null,
  });

  const rows: SchoolRow[] = schools.data?.schools ?? [];
  const pageCount = Math.max(1, Math.ceil((schools.data?.total ?? 0) / PAGE_SIZE));

  const columns: DataTableColumn<SchoolRow>[] = [
    {
      id: 'name',
      header: 'School',
      sortable: true,
      cell: (row) => (
        <div>
          <Link
            href={`/admin/schools/${row.id}`}
            className="font-medium text-text-primary hover:underline"
          >
            {row.name}
          </Link>
          <p className="text-xs text-text-muted">{row.subdomain}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      cell: (row) => <SchoolStatusBadge value={row.status} />,
    },
    {
      // Not sortable: studentCount is a per-school RoleAssignment count, not
      // a School column, and RoleAssignment's RLS makes a single cross-
      // school ORDER BY on it unavailable — see this file's own doc comment.
      id: 'studentCount',
      header: 'Students',
      align: 'right',
      cell: (row) => row.studentCount,
    },
    {
      id: 'actions',
      header: '',
      cell: (row) => (
        <div className="flex justify-end gap-2">
          {row.status === 'EXPIRED' ? (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/admin/schools/${row.id}/subscription`}>Renew</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/schools/${row.id}`}>View</Link>
          </Button>
        </div>
      ),
      align: 'right',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Schools</h1>
        <Button asChild>
          <Link href="/admin/schools/new">
            <Plus aria-hidden /> Create school
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="school-search">Search</Label>
          <Input
            id="school-search"
            className="w-64"
            placeholder="Name or subdomain"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => updateFilterParams({ q: searchInput || null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') updateFilterParams({ q: searchInput || null });
            }}
          />
        </div>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 text-xs font-medium text-text-secondary">Status</legend>
          {SCHOOL_STATUSES.map((status) => (
            <label key={status} className="flex items-center gap-1.5 text-sm text-text-primary">
              <Checkbox
                checked={statusFilter.includes(status)}
                onCheckedChange={() => toggleStatus(status)}
              />
              {STATUS_LABEL[status]}
            </label>
          ))}
        </fieldset>
      </div>

      {schools.isError ? (
        <ErrorState error={schools.error} onRetry={() => void schools.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          getRowHref={(row) => `/admin/schools/${row.id}`}
          isLoading={schools.isPending}
          sort={sort}
          onSortChange={(next) =>
            updateFilterParams({ sortBy: next?.columnId ?? null, sortDir: next?.direction ?? null })
          }
          page={page}
          pageCount={pageCount}
          total={schools.data?.total}
          pageSize={PAGE_SIZE}
          onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : null })}
          emptyState={
            statusFilter.length === 0 && !search ? (
              <EmptyState
                icon={SchoolIcon}
                title="No schools have been onboarded yet."
                description="Create the first school to start issuing activation keys."
                action={
                  <Button asChild>
                    <Link href="/admin/schools/new">Create school</Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={SchoolIcon}
                title="No schools match these filters"
                description="Try a different search term or status."
              />
            )
          }
        />
      )}
    </div>
  );
}
