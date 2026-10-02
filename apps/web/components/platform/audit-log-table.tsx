'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { formatDateTime } from '@/lib/format/date';
import { useAuditLog } from '@/lib/platform/queries';

interface AuditRow {
  id: string;
  /** Null for a platform-level event (B20: Software Admin MFA, platform
   * sign-in, operator commands) — no school was affected. */
  schoolId: string | null;
  actorUserId: string;
  actorDisplayName?: string | null;
  actorRole: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  reason?: string | null;
  breakGlass: boolean;
  occurredAt: string;
}

const PAGE_SIZE = 25;
const COMPACT_PAGE_SIZE = 10;

export interface AuditLogTableProps {
  /** Pins the query to one school server-side and hides the school column/
   * filter entirely — never user-editable in this mode. Powers the per-
   * school Audit and Activity tabs. */
  fixedSchoolId?: string;
  /** `false` for the Activity tab: no filter row, no date-range picker —
   * just the paginated (or, in `compact` mode, capped) list. */
  showFilters?: boolean;
  /** Activity tab's lighter presentation: a smaller page, no filter row,
   * no pager — a "view more" link into the full Audit tab instead. Same
   * data source as the full table (one `AuditEvent` table in this schema,
   * `04 §8`'s "Audit" vs. "Activity" distinction is presentation depth,
   * not a different read). */
  compact?: boolean;
}

/**
 * B10 — the shared table behind all three F3 audit destinations
 * (`/admin/audit`, the per-school Audit tab, the per-school Activity tab).
 * Always consumes `GET /v1/platform/audit` (`useAuditLog`), never
 * `GET /v1/audit` — Software Admin has no school session, so the school-
 * scoped endpoint is structurally unreachable from anywhere inside the
 * `/admin/*` Platform Admin shell. `GET /v1/audit` ships with no frontend
 * consumer in this pass — a deliberate, documented gap, not an omission
 * (see `backend-roadmap.md`'s B10 Deferred items).
 *
 * Props-driven mode switching, matching `SchoolDetailTabs`'s own
 * established "one component, mode via props" convention, rather than
 * three separate implementations.
 */
export function AuditLogTable({
  fixedSchoolId,
  showFilters = true,
  compact = false,
}: AuditLogTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const schoolId = fixedSchoolId ?? searchParams.get('schoolId') ?? undefined;
  const actorUserId = searchParams.get('actorUserId') ?? undefined;
  const action = searchParams.get('action') ?? undefined;
  const entityType = searchParams.get('entityType') ?? undefined;
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`?${params.toString()}`);
  }

  function updateFilterParams(next: Record<string, string | null>) {
    updateParams({ ...next, page: null });
  }

  const pageSize = compact ? COMPACT_PAGE_SIZE : PAGE_SIZE;
  const auditLog = useAuditLog({
    ...(schoolId && { schoolId }),
    ...(actorUserId && { actorUserId }),
    ...(action && { action }),
    ...(entityType && { entityType }),
    ...(from && { from }),
    ...(to && { to }),
    page: compact ? 1 : page,
    pageSize,
  });

  const rows: AuditRow[] = auditLog.data?.items ?? [];
  const total = auditLog.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const columns: DataTableColumn<AuditRow>[] = [
    {
      id: 'occurredAt',
      header: 'When',
      cell: (row) => formatDateTime(row.occurredAt),
    },
    {
      id: 'actor',
      header: 'Actor',
      cell: (row) => (
        <div>
          <p className="text-text-primary">{row.actorDisplayName ?? row.actorUserId}</p>
          <p className="text-xs text-text-muted">{row.actorRole}</p>
        </div>
      ),
    },
    {
      id: 'action',
      header: 'Action',
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-text-primary">{row.action}</span>
          {row.breakGlass ? (
            <Badge status="danger">
              <ShieldAlert className="mr-1 size-3" aria-hidden />
              Break-glass
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: 'entity',
      header: 'Entity',
      cell: (row) =>
        row.entityType ? (
          <span className="text-text-secondary">
            {row.entityType}
            {row.entityId ? ` (${row.entityId.slice(0, 8)}…)` : ''}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    ...(fixedSchoolId
      ? []
      : [
          {
            id: 'schoolId',
            header: 'School',
            cell: (row: AuditRow) =>
              row.schoolId ? (
                <Link
                  href={`/admin/schools/${row.schoolId}`}
                  className="text-xs text-text-secondary hover:underline"
                >
                  {row.schoolId.slice(0, 8)}…
                </Link>
              ) : (
                <span className="text-xs text-text-secondary">Platform</span>
              ),
          } satisfies DataTableColumn<AuditRow>,
        ]),
    ...(compact
      ? []
      : [
          {
            id: 'reason',
            header: 'Reason',
            cell: (row: AuditRow) => row.reason ?? <span className="text-text-muted">—</span>,
          } satisfies DataTableColumn<AuditRow>,
        ]),
  ];

  return (
    <div className="space-y-4">
      {showFilters ? (
        <div className="flex flex-wrap items-end gap-4">
          {!fixedSchoolId ? (
            <div>
              <Label htmlFor="audit-school-id">School ID</Label>
              <Input
                id="audit-school-id"
                className="w-56"
                placeholder="Filter to one school"
                defaultValue={schoolId ?? ''}
                onBlur={(e) => updateFilterParams({ schoolId: e.target.value || null })}
              />
            </div>
          ) : null}
          <div>
            <Label htmlFor="audit-actor">Actor user ID</Label>
            <Input
              id="audit-actor"
              className="w-56"
              defaultValue={actorUserId ?? ''}
              onBlur={(e) => updateFilterParams({ actorUserId: e.target.value || null })}
            />
          </div>
          <div>
            <Label htmlFor="audit-action">Action</Label>
            <Input
              id="audit-action"
              className="w-48"
              placeholder="e.g. CLASS_GROUP_CREATED"
              defaultValue={action ?? ''}
              onBlur={(e) => updateFilterParams({ action: e.target.value || null })}
            />
          </div>
          <div>
            <Label htmlFor="audit-entity-type">Entity type</Label>
            <Input
              id="audit-entity-type"
              className="w-40"
              defaultValue={entityType ?? ''}
              onBlur={(e) => updateFilterParams({ entityType: e.target.value || null })}
            />
          </div>
          <div>
            <Label htmlFor="audit-from">From</Label>
            <Input
              id="audit-from"
              type="date"
              className="w-40"
              defaultValue={from?.slice(0, 10) ?? ''}
              onChange={(e) =>
                updateFilterParams({
                  from: e.target.value ? `${e.target.value}T00:00:00.000Z` : null,
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="audit-to">To</Label>
            <Input
              id="audit-to"
              type="date"
              className="w-40"
              defaultValue={to?.slice(0, 10) ?? ''}
              onChange={(e) =>
                updateFilterParams({
                  to: e.target.value ? `${e.target.value}T23:59:59.999Z` : null,
                })
              }
            />
          </div>
        </div>
      ) : null}

      {auditLog.isError ? (
        <ErrorState error={auditLog.error} onRetry={() => void auditLog.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          isLoading={auditLog.isPending}
          {...(!compact && {
            page,
            pageCount,
            onPageChange: (next: number) => updateParams({ page: next > 1 ? String(next) : null }),
          })}
          emptyState={
            <EmptyState
              icon={ShieldAlert}
              title="No events match these filters"
              description={
                showFilters ? 'Try widening the filters or date range.' : 'No recent activity yet.'
              }
            />
          }
        />
      )}

      {compact && fixedSchoolId && total > rows.length ? (
        <Link
          href={`/admin/schools/${fixedSchoolId}/audit`}
          className="inline-block text-sm text-brand-primary hover:underline"
        >
          View full audit log →
        </Link>
      ) : null}
    </div>
  );
}
