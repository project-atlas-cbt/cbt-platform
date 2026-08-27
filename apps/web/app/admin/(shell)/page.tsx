'use client';

import Link from 'next/link';
import { School as SchoolIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { MetricTile } from '@/components/platform/metric-tile';
import { SchoolStatusBadge } from '@/components/platform/status-badges';
import { usePlatformMetrics, useSchools } from '@/lib/platform/queries';
import { formatDateTime } from '@/lib/format/date';
import { DASHBOARD_QUESTION } from '@/lib/nav';

/**
 * SA-01, `04 §6` / `05 §2.1`. DoD item 1: every metric `04 §6` names
 * (Total/Active/Expired schools, Students, Teachers, Exams, Attempts),
 * plus `05 §2.1`'s fuller status breakdown (Provisional/Suspended/
 * Deactivated) — all real fields already on `PlatformMetricsResponseDto`,
 * nothing fabricated. "Recent platform activity" (`05 §2.1`) is honestly
 * deferred — needs `B10`'s audit-read API, which doesn't exist yet.
 *
 * DoD item 12: a metrics-query failure degrades only the metrics section
 * (`ErrorState`), not the whole dashboard — "schools requiring attention"
 * and the Create-school action still render from their own, independent
 * query.
 */
export default function PlatformDashboardPage() {
  const metrics = usePlatformMetrics();
  const attention = useSchools({ status: ['SUSPENDED', 'EXPIRED'] });

  const platformIsEmpty = metrics.isSuccess && metrics.data.totalSchools === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Platform overview</h1>
        <p className="text-sm text-text-muted">{DASHBOARD_QUESTION.SOFTWARE_ADMIN}</p>
      </div>

      {platformIsEmpty ? (
        <EmptyState
          icon={SchoolIcon}
          title="No schools have been onboarded yet."
          description="Create the first school to start issuing activation keys and managing subscriptions."
          action={
            <Button asChild>
              <Link href="/admin/schools/new">
                <Plus aria-hidden /> Create school
              </Link>
            </Button>
          }
        />
      ) : metrics.isError ? (
        <ErrorState
          error={metrics.error}
          onRetry={() => void metrics.refetch()}
          title="Metrics unavailable"
        />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-medium text-text-secondary">Schools by status</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <MetricTile
                label="Total schools"
                value={metrics.data?.totalSchools ?? 0}
                isLoading={metrics.isPending}
                emphasis
              />
              <MetricTile
                label="Active"
                value={metrics.data?.activeSchools ?? 0}
                isLoading={metrics.isPending}
              />
              <MetricTile
                label="Provisional"
                value={metrics.data?.provisionalSchools ?? 0}
                isLoading={metrics.isPending}
              />
              <MetricTile
                label="Suspended"
                value={metrics.data?.suspendedSchools ?? 0}
                isLoading={metrics.isPending}
              />
              <MetricTile
                label="Expired"
                value={metrics.data?.expiredSchools ?? 0}
                isLoading={metrics.isPending}
              />
              <MetricTile
                label="Deactivated"
                value={metrics.data?.deactivatedSchools ?? 0}
                isLoading={metrics.isPending}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-text-secondary">Usage</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricTile
                label="Students"
                value={metrics.data?.students ?? 0}
                isLoading={metrics.isPending}
              />
              <MetricTile
                label="Teachers"
                value={metrics.data?.teachers ?? 0}
                isLoading={metrics.isPending}
              />
              <MetricTile
                label="Exams conducted"
                value={metrics.data?.examsConducted ?? 0}
                isLoading={metrics.isPending}
              />
              <MetricTile
                label="Exam attempts"
                value={metrics.data?.attempts ?? 0}
                isLoading={metrics.isPending}
              />
            </div>
            {metrics.isSuccess ? (
              <p className="mt-2 text-xs text-text-muted">
                {metrics.data.computedAt
                  ? `Last computed ${formatDateTime(metrics.data.computedAt)}`
                  : 'Not yet computed — the platform metrics sweep hasn’t run yet.'}
              </p>
            ) : null}
          </section>
        </div>
      )}

      {!platformIsEmpty ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-secondary">Schools requiring attention</h2>
            <Link href="/admin/subscriptions" className="text-sm text-brand-primary underline">
              View all
            </Link>
          </div>
          {attention.isError ? (
            <ErrorState
              error={attention.error}
              onRetry={() => void attention.refetch()}
              title="Couldn’t load"
            />
          ) : attention.isSuccess && attention.data.schools.length === 0 ? (
            <p className="text-sm text-text-muted">No school currently needs attention.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-surface">
              {(attention.data?.schools ?? []).slice(0, 5).map((school) => (
                <li key={school.id} className="flex items-center justify-between px-4 py-2.5">
                  <Link
                    href={`/admin/schools/${school.id}`}
                    className="text-sm font-medium text-text-primary hover:underline"
                  >
                    {school.name}
                  </Link>
                  <SchoolStatusBadge value={school.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
