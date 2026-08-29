'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useImportRows } from '@/lib/imports/queries';

const PAGE_SIZE = 100;

export interface ErrorTableProps {
  jobId: string;
}

interface ErrorRowView {
  rowNumber: number;
  fields: string;
  reason: string;
  rawData: Record<string, string>;
}

/**
 * DoD item 4 (per-row errors with a row number and specific reason) and the
 * roadmap's Performance requirement ("renders 500+ error rows without
 * freezing"). Server-paginated at a fixed `pageSize` — `ListImportRowsQueryDto`
 * already caps this at 200, the same server-owned pagination mechanism
 * `StudentsScreen` already proves at 1,500-row scale — so this never mounts
 * more than `PAGE_SIZE` DOM rows regardless of the underlying dataset size,
 * and no client-side virtualization dependency is introduced (considered
 * and rejected during F8 planning per AGENTS.md §9 — server pagination
 * alone already satisfies the requirement).
 */
export function ErrorTable({ jobId }: ErrorTableProps) {
  const [page, setPage] = useState(1);
  const rows = useImportRows(jobId, { page, pageSize: PAGE_SIZE, status: 'INVALID' });

  if (rows.isError) {
    return <ErrorState error={rows.error} onRetry={() => void rows.refetch()} />;
  }

  const errorRows: ErrorRowView[] = (rows.data?.rows ?? []).map((row) => {
    const errors = row.errors ?? [];
    return {
      rowNumber: row.rowNumber,
      fields: errors.length ? errors.map((e) => e.field).join(', ') : '—',
      reason: errors.length ? errors.map((e) => e.message).join('; ') : 'This row is invalid.',
      rawData: row.rawData,
    };
  });

  const pageCount = Math.max(1, Math.ceil((rows.data?.rowsTotal ?? 0) / PAGE_SIZE));

  const columns: DataTableColumn<ErrorRowView>[] = [
    { id: 'rowNumber', header: 'Row', align: 'right', cell: (r) => r.rowNumber },
    { id: 'fields', header: 'Field', cell: (r) => r.fields },
    { id: 'reason', header: 'Reason', cell: (r) => r.reason },
    {
      id: 'raw',
      header: 'Row data',
      cell: (r) => (
        <details className="text-xs text-text-muted">
          <summary className="cursor-pointer select-none text-text-secondary">View</summary>
          <dl className="mt-1 space-y-0.5">
            {Object.entries(r.rawData).map(([key, value]) => (
              <div key={key} className="flex gap-1">
                <dt className="font-medium">{key}:</dt>
                <dd>{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </details>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={errorRows}
      getRowId={(r) => String(r.rowNumber)}
      isLoading={rows.isPending}
      page={page}
      pageCount={pageCount}
      onPageChange={setPage}
      caption="Rows needing attention"
      emptyState={
        <EmptyState
          title="No rows need attention"
          description="Every row in this file passed validation."
        />
      }
    />
  );
}
