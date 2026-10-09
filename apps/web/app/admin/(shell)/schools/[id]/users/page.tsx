'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Users } from 'lucide-react';
import {
  SCHOOL_ROLES,
  USER_STATUSES,
  type MembershipStatus,
  type Role,
  type UserStatus,
} from '@atlas/domain';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/ui/data-table';
import { UserStatusBadge, MembershipStatusBadge } from '@/components/people/people-status-badges';
import { useSchoolUsers } from '@/lib/platform/queries';
import { formatDateTime } from '@/lib/format/date';

const PAGE_SIZE = 25;

// Radix Select rejects empty-string item values — the established
// codebase pattern (`ExamFiltersBar`) is a sentinel value mapped back to
// "no filter" in `onValueChange`.
const ALL = '__all__';

const ROLE_LABEL: Record<Role, string> = {
  SOFTWARE_ADMIN: 'Software Admin',
  SCHOOL_ADMIN: 'School Admin',
  MODERATOR: 'Moderator',
  HOD: 'HOD',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  INVITED: 'Invited',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  INACTIVE: 'Inactive',
};

interface SchoolUserRow {
  membershipId: string;
  displayName: string;
  loginIdentifier: string;
  email: string | null;
  roles: Role[];
  userStatus: UserStatus;
  membershipStatus: MembershipStatus;
  joinedAt: string;
}

function asRole(value: string | null): (typeof SCHOOL_ROLES)[number] | undefined {
  return value && (SCHOOL_ROLES as readonly string[]).includes(value)
    ? (value as (typeof SCHOOL_ROLES)[number])
    : undefined;
}

function asUserStatus(value: string | null): UserStatus | undefined {
  return value && (USER_STATUSES as readonly string[]).includes(value)
    ? (value as UserStatus)
    : undefined;
}

/**
 * SA-04's Users section (`04 §8`) — a read-only directory of the school's
 * people, from `GET /platform/schools/:id/users` (B3/F3 gap-closure that
 * replaced the previous "Not yet available" placeholder). Every member
 * appears once with all their ACTIVE roles (a Teacher+HOD shows both),
 * matching `GET /auth/me`'s multi-role reality. Filters/sort/pagination are
 * server-side and mirrored into the URL (same convention as the Schools
 * list screen), so this view is shareable and back-navigable.
 */
export default function SchoolUsersPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get('q') ?? '';
  const role = asRole(searchParams.get('role'));
  const status = asUserStatus(searchParams.get('status'));
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const requestedSortBy = (searchParams.get('sortBy') ?? null) as 'joinedAt' | 'lastName' | null;
  const requestedSortDir = (searchParams.get('sortDir') ?? null) as 'asc' | 'desc' | null;
  const sort: DataTableSort | null =
    requestedSortBy === 'lastName' || requestedSortBy === 'joinedAt'
      ? { columnId: requestedSortBy, direction: requestedSortDir === 'asc' ? 'asc' : 'desc' }
      : null;

  const [searchInput, setSearchInput] = useState(search);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`/admin/schools/${id}/users?${params.toString()}`);
  }

  // Filtering/sorting can leave the view on a now out-of-range page — always
  // reset to page 1 alongside those changes.
  function updateFilterParams(next: Record<string, string | null>) {
    updateParams({ ...next, page: null });
  }

  const users = useSchoolUsers(id, {
    q: search,
    role: role ?? null,
    status: status ?? null,
    sortBy: (sort?.columnId as 'joinedAt' | 'lastName' | null) ?? null,
    sortDir: (sort?.direction as 'asc' | 'desc' | null) ?? null,
    page,
  });

  const rows: SchoolUserRow[] = users.data?.users ?? [];
  const pageCount = Math.max(1, Math.ceil((users.data?.total ?? 0) / PAGE_SIZE));
  const hasFilters = Boolean(search || role || status);

  const columns: DataTableColumn<SchoolUserRow>[] = [
    {
      id: 'lastName',
      header: 'Member',
      sortable: true,
      cell: (row) => (
        <div>
          <p className="font-medium text-text-primary">{row.displayName}</p>
          <p className="text-xs text-text-muted">{row.loginIdentifier}</p>
        </div>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      cell: (row) => row.email ?? '—',
    },
    {
      id: 'roles',
      header: 'Roles',
      cell: (row) => row.roles.map((roleName) => ROLE_LABEL[roleName]).join(', '),
    },
    {
      id: 'userStatus',
      header: 'Account',
      cell: (row) => <UserStatusBadge value={row.userStatus} />,
    },
    {
      id: 'membershipStatus',
      header: 'Membership',
      cell: (row) => <MembershipStatusBadge value={row.membershipStatus} />,
    },
    {
      id: 'joinedAt',
      header: 'Joined',
      sortable: true,
      cell: (row) => formatDateTime(row.joinedAt),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="user-search">Search</Label>
          <Input
            id="user-search"
            className="w-64"
            placeholder="Name, username, or email"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => updateFilterParams({ q: searchInput || null })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') updateFilterParams({ q: searchInput || null });
            }}
          />
        </div>
        <div>
          <Label htmlFor="user-role">Role</Label>
          <Select
            value={role ?? ALL}
            onValueChange={(value) => updateFilterParams({ role: value === ALL ? null : value })}
          >
            <SelectTrigger id="user-role" className="w-48">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              {SCHOOL_ROLES.map((roleName) => (
                <SelectItem key={roleName} value={roleName}>
                  {ROLE_LABEL[roleName]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="user-status">Account status</Label>
          <Select
            value={status ?? ALL}
            onValueChange={(value) => updateFilterParams({ status: value === ALL ? null : value })}
          >
            <SelectTrigger id="user-status" className="w-48">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {USER_STATUSES.map((userStatus) => (
                <SelectItem key={userStatus} value={userStatus}>
                  {STATUS_LABEL[userStatus]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.membershipId}
          isLoading={users.isPending}
          sort={sort}
          onSortChange={(next) =>
            updateFilterParams({
              sortBy: next?.columnId ?? null,
              sortDir: next?.direction ?? null,
            })
          }
          page={page}
          pageCount={pageCount}
          total={users.data?.total}
          pageSize={PAGE_SIZE}
          onPageChange={(next) => updateParams({ page: next > 1 ? String(next) : null })}
          caption={`${users.data?.total ?? 0} people at this school`}
          emptyState={
            !hasFilters ? (
              <EmptyState
                icon={Users}
                title="No one has been added to this school yet"
                description="People appear here once invitations are accepted and roles are assigned."
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No users match these filters"
                description="Try a different search term, role, or account status."
              />
            )
          }
        />
      )}
    </div>
  );
}
