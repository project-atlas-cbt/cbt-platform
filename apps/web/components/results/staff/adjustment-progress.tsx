'use client';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdjustmentOperation } from '@/lib/results/staff-queries';

const STATUS_META: Record<string, { label: string; status: BadgeProps['status'] }> = {
  PENDING: { label: 'Queued', status: 'warning' },
  PROCESSING: { label: 'Applying', status: 'warning' },
  COMPLETED: { label: 'Completed', status: 'success' },
  FAILED: { label: 'Failed', status: 'danger' },
};

/**
 * F15 — progress for one bulk adjustment operation (ADR-0025's parent
 * operation over per-result children, idempotent and resumable).
 *
 * Shows real counts rather than a spinner with no information:
 * `appliedCount`/`totalCount` is what tells a moderator whether a
 * long-running operation over a large cohort is actually moving.
 * `failedCount` and `failureReason` are surfaced rather than swallowed — a
 * partially applied adjustment is precisely the state staff must be told
 * about, because the exam stays unpublishable until it resolves.
 *
 * Polling stops on `COMPLETED`/`FAILED` (see `useAdjustmentOperation`).
 */
export function AdjustmentProgress({ operationId }: { operationId: string }) {
  const query = useAdjustmentOperation(operationId);

  if (query.isPending) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Couldn’t load adjustment progress"
      />
    );
  }

  const operation = query.data;
  const meta = STATUS_META[operation.status] ?? {
    label: operation.status,
    status: 'neutral' as const,
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">Adjustment</span>
          <Badge status={meta.status}>{meta.label}</Badge>
        </div>
        <span className="text-sm text-text-secondary">
          {operation.appliedCount} of {operation.totalCount} applied
          {operation.failedCount > 0 ? `, ${operation.failedCount} failed` : ''}
        </span>
      </div>
      <dl className="mt-3 space-y-1 text-xs text-text-muted">
        <div className="flex gap-2">
          <dt className="font-medium">Type</dt>
          <dd>{operation.type}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Reason</dt>
          <dd>{operation.reason}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Raised by</dt>
          <dd>{operation.createdByName}</dd>
        </div>
      </dl>
      {operation.failureReason ? (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {operation.failureReason}
        </p>
      ) : null}
    </div>
  );
}
