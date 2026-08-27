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

function sortRows(rows: SchoolRow[], sort: DataTableSort | null): SchoolRow[] {
  if (!sort) return rows;
  const sorted = [...rows].sort((a, b) => {
    switch (sort.columnId) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'status':
        return a.status.localeCompare(b.status);
      case 'studentCount':
        return a.studentCount - b.studentCount;
      case 'createdAt':
        return a.createdAt.localeCompare(b.createdAt);
      default:
        return 0;
    }
  });
  return sort.direction === 'desc' ? sorted.reverse() : sorted;
}

/**
 * SA-02 (`05 §3.1`). Search/sort are client-side over the fetched list —
 * `GET /platform/schools` has no pagination or search params (B3's own
 * endpoint shape), which is fine at the expected admin-scale school count;
 * documented as a scoping note, not a silent gap (see CLAUDE.md's F3
 * change-log entry). Filter/search/sort state is mirrored into the URL
 * (roadmap's own State management requirement) so this view is
 * shareable/back-navigable.
 */
export default function SchoolsListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = (searchParams.get('status')?.split(',').filter(Boolean) ??
    []) as SchoolStatus[];
  const search = searchParams.get('q') ?? '';
  const sortColumn = searchParams.get('sortBy');
  const sortDir = searchParams.get('sortDir');
  // Memoized so its identity is stable across renders unless the underlying
  // params actually change — otherwise filteredSorted's own useMemo below
  // would never really memoize (a fresh object literal every render).
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

  function toggleStatus(status: SchoolStatus) {
    const next = statusFilter.includes(status)
      ? statusFilter.filter((s) => s !== status)
      : [...statusFilter, status];
    updateParams({ status: next.join(',') || null });
  }

  const schools = useSchools(statusFilter);

  const filteredSorted = useMemo(() => {
    const rows: SchoolRow[] = schools.data?.schools ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (r) => r.name.toLowerCase().includes(q) || r.subdomain.toLowerCase().includes(q),
        )
      : rows;
    return sortRows(filtered, sort);
  }, [schools.data, search, sort]);

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
      id: 'studentCount',
      header: 'Students',
      sortable: true,
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
            onBlur={() => updateParams({ q: searchInput || null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') updateParams({ q: searchInput || null });
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
          rows={filteredSorted}
          getRowId={(r) => r.id}
          isLoading={schools.isPending}
          sort={sort}
          onSortChange={(next) =>
            updateParams({ sortBy: next?.columnId ?? null, sortDir: next?.direction ?? null })
          }
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
