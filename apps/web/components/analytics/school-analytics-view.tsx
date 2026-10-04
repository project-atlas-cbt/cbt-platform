'use client';

import Link from 'next/link';
import { ArrowLeft, Calendar, CheckCircle2, GraduationCap, TrendingUp, Users } from 'lucide-react';
import { useAcademicsContext } from '@/lib/academics/queries';
import { formatCount, formatPercentage, useSchoolAnalytics } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { MetricTile } from './metric-tile';
import { ComparisonChart } from './comparison-chart';
import { TrendChart } from './trend-chart';

export function SchoolAnalyticsView() {
  const contextQuery = useAcademicsContext();
  const currentSession = contextQuery.data?.session;
  const currentTerm = contextQuery.data?.term;

  const analyticsQuery = useSchoolAnalytics({
    academicSessionId: currentSession?.id,
    academicTermId: currentTerm?.id,
  });

  const analytics = analyticsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link href="/school">
            <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Dashboard</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary">School Analytics</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Comprehensive institutional performance, participation, and department trends (05
              §55.3)
            </p>
          </div>
        </div>

        {currentSession && currentTerm ? (
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
            <Calendar className="h-3.5 w-3.5 text-brand-primary" />
            <span>
              {currentSession.name} · {currentTerm.name}
            </span>
          </div>
        ) : null}
      </div>

      {/* Primary School Indicators */}
      <ErrorBoundary>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile
            label="School Average"
            value={analyticsQuery.isPending ? '—' : formatPercentage(analytics?.averagePercentage)}
            subtitle="Overall school score"
            icon={<TrendingUp className="h-4 w-4" />}
            emphasis
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Pass Rate"
            value={analyticsQuery.isPending ? '—' : formatPercentage(analytics?.passRate)}
            subtitle="Passing grades percentage"
            icon={<GraduationCap className="h-4 w-4" />}
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Completion Rate"
            value={
              analyticsQuery.isPending
                ? '—'
                : formatPercentage(analytics?.participation?.completionRate)
            }
            subtitle="Attendance / completion"
            icon={<CheckCircle2 className="h-4 w-4" />}
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Assessed Results"
            value={analyticsQuery.isPending ? '—' : formatCount(analytics?.resultCount)}
            subtitle="Recorded score records"
            icon={<Users className="h-4 w-4" />}
            isLoading={analyticsQuery.isPending}
          />
        </div>
      </ErrorBoundary>

      {/* Participation & Assessment Volume */}
      <ErrorBoundary>
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">
            Participation & Assessment Volume
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-md border border-border/60 bg-surface-raised/30 p-3">
              <span className="text-[11px] font-medium text-text-muted uppercase">
                Expected Students
              </span>
              <p className="text-xl font-bold tabular-nums text-text-primary mt-0.5">
                {analyticsQuery.isPending
                  ? '—'
                  : formatCount(analytics?.participation?.expectedStudentCount)}
              </p>
            </div>
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase">
                Attended
              </span>
              <p className="text-xl font-bold tabular-nums text-success dark:text-emerald-300 mt-0.5">
                {analyticsQuery.isPending
                  ? '—'
                  : formatCount(analytics?.participation?.attendedCount)}
              </p>
            </div>
            <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-3">
              <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400 uppercase">
                Absent
              </span>
              <p className="text-xl font-bold tabular-nums text-rose-600 dark:text-rose-300 mt-0.5">
                {analyticsQuery.isPending
                  ? '—'
                  : formatCount(analytics?.participation?.absentCount)}
              </p>
            </div>
            <div className="rounded-md border border-border/60 bg-surface-raised/30 p-3">
              <span className="text-[11px] font-medium text-text-muted uppercase">
                Total Attempts
              </span>
              <p className="text-xl font-bold tabular-nums text-text-primary mt-0.5">
                {analyticsQuery.isPending ? '—' : formatCount(analytics?.attemptCount)}
              </p>
            </div>
          </div>
        </div>
      </ErrorBoundary>

      {/* Department Comparisons & Session Trends */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ErrorBoundary>
          <ComparisonChart
            items={analytics?.departments ?? []}
            title="Department Comparison"
            subtitle="Academic performance averages across departments"
            metricLabel="Dept Avg"
            emptyMessage="No departmental performance data available yet."
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <TrendChart
            trends={analytics?.sessionTrends ?? []}
            title="Academic Session Trends"
            subtitle="Institutional score and participation trajectory"
            emptyMessage="Historical session trends will appear here over time."
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
