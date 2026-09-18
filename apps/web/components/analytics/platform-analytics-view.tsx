'use client';

import { Activity, CheckCircle2, School, Users } from 'lucide-react';
import { formatCount, usePlatformAnalytics } from '@/lib/analytics';
import { formatDate } from '@/lib/format/date';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { MetricTile } from './metric-tile';

export function PlatformAnalyticsView() {
  const analyticsQuery = usePlatformAnalytics();
  const data = analyticsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Platform Analytics</h1>
          <p className="text-xs text-text-muted mt-0.5">
            System-wide commercial health, tenant activation, and examination volume (04 §9, 05
            §55.4)
          </p>
        </div>

        {data?.computedAt ? (
          <div className="text-xs text-text-muted">
            Computed:{' '}
            <span className="font-medium text-text-secondary">{formatDate(data.computedAt)}</span>
          </div>
        ) : null}
      </div>

      {/* Primary Platform Overview */}
      <ErrorBoundary>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile
            label="Total Schools"
            value={analyticsQuery.isPending ? '—' : formatCount(data?.totalSchools)}
            subtitle="Registered school tenants"
            icon={<School className="h-4 w-4" />}
            emphasis
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Active Schools"
            value={analyticsQuery.isPending ? '—' : formatCount(data?.activeSchools)}
            subtitle="Fully operational"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Platform Students"
            value={analyticsQuery.isPending ? '—' : formatCount(data?.students)}
            subtitle="All student accounts"
            icon={<Users className="h-4 w-4" />}
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Total Exam Attempts"
            value={analyticsQuery.isPending ? '—' : formatCount(data?.attempts)}
            subtitle="Delivered CBT exams"
            icon={<Activity className="h-4 w-4" />}
            isLoading={analyticsQuery.isPending}
          />
        </div>
      </ErrorBoundary>

      {/* School Tenants Breakdown & Subscriptions Health */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* School Tenants Status */}
        <ErrorBoundary>
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Tenant Lifecycle Status</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <span className="text-[11px] font-medium text-text-muted uppercase">Active</span>
                <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCount(data?.activeSchools)}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <span className="text-[11px] font-medium text-text-muted uppercase">
                  Provisional
                </span>
                <p className="mt-1 text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {formatCount(data?.provisionalSchools)}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <span className="text-[11px] font-medium text-text-muted uppercase">Suspended</span>
                <p className="mt-1 text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
                  {formatCount(data?.suspendedSchools)}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <span className="text-[11px] font-medium text-text-muted uppercase">Expired</span>
                <p className="mt-1 text-lg font-bold tabular-nums text-text-muted">
                  {formatCount(data?.expiredSchools)}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <span className="text-[11px] font-medium text-text-muted uppercase">
                  Deactivated
                </span>
                <p className="mt-1 text-lg font-bold tabular-nums text-text-muted">
                  {formatCount(data?.deactivatedSchools)}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <span className="text-[11px] font-medium text-text-muted uppercase">
                  Activations
                </span>
                <p className="mt-1 text-lg font-bold tabular-nums text-brand-primary">
                  {formatCount(data?.activations)}
                </p>
              </div>
            </div>
          </div>
        </ErrorBoundary>

        {/* Subscriptions Status */}
        <ErrorBoundary>
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Subscription Health</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase">
                  Active Subscriptions
                </span>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-300">
                  {formatCount(data?.activeSubscriptions)}
                </p>
              </div>
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 uppercase">
                  Expiring Soon (14d)
                </span>
                <p className="mt-1 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-300">
                  {formatCount(data?.expiringSubscriptions)}
                </p>
              </div>
              <div className="rounded-md border border-border/60 bg-surface-raised/40 p-3">
                <span className="text-[11px] font-medium text-text-muted uppercase">
                  Pending Activation
                </span>
                <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">
                  {formatCount(data?.pendingSubscriptions)}
                </p>
              </div>
              <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-3">
                <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400 uppercase">
                  Expired
                </span>
                <p className="mt-1 text-xl font-bold tabular-nums text-rose-600 dark:text-rose-300">
                  {formatCount(data?.expiredSubscriptions)}
                </p>
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </div>

      {/* Platform Monthly Growth Trends */}
      {data?.trends && data.trends.length > 0 ? (
        <ErrorBoundary>
          <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Monthly Platform Trends</h3>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs" aria-label="Platform monthly trends">
                <thead className="bg-surface-raised/60 text-text-muted border-b border-border font-medium">
                  <tr>
                    <th scope="col" className="py-2.5 px-3">
                      Month
                    </th>
                    <th scope="col" className="py-2.5 px-3 text-right">
                      Schools Created
                    </th>
                    <th scope="col" className="py-2.5 px-3 text-right">
                      Exams Created
                    </th>
                    <th scope="col" className="py-2.5 px-3 text-right">
                      Attempts Started
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.trends.map((t) => (
                    <tr key={t.month} className="hover:bg-surface-raised/40">
                      <td className="py-2 px-3 font-medium text-text-primary">{t.month}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-text-primary font-semibold">
                        {formatCount(t.schoolsCreated)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-text-secondary">
                        {formatCount(t.examsCreated)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-brand-primary font-semibold">
                        {formatCount(t.attemptsStarted)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ErrorBoundary>
      ) : null}
    </div>
  );
}
