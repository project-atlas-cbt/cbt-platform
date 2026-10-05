'use client';

import Link from 'next/link';
import { ArrowLeft, BookOpen, Calendar, GraduationCap, TrendingUp, Users } from 'lucide-react';
import { useAcademicsContext, useDepartments } from '@/lib/academics/queries';
import { formatCount, formatPercentage, useDepartmentAnalytics } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { MetricTile } from './metric-tile';
import { ComparisonChart } from './comparison-chart';
import { TrendChart } from './trend-chart';

export function DepartmentAnalyticsView() {
  const contextQuery = useAcademicsContext();
  const currentSession = contextQuery.data?.session;
  const currentTerm = contextQuery.data?.term;

  const departmentsQuery = useDepartments();
  const department = departmentsQuery.data?.departments?.[0];
  const departmentId = department?.id;

  const analyticsQuery = useDepartmentAnalytics(
    departmentId,
    {
      academicSessionId: currentSession?.id,
      academicTermId: currentTerm?.id,
    },
    { enabled: Boolean(departmentId) },
  );

  const analytics = analyticsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link href="/hod">
            <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Dashboard</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              {department?.name || 'Department'} Analytics
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Subject comparisons, class performance, and historical trends
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

      {/* Department Key Metrics */}
      <ErrorBoundary>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile
            label="Department Average"
            value={analyticsQuery.isPending ? '—' : formatPercentage(analytics?.averagePercentage)}
            subtitle="Overall department score"
            icon={<TrendingUp className="h-4 w-4" />}
            emphasis
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Pass Rate"
            value={analyticsQuery.isPending ? '—' : formatPercentage(analytics?.passRate)}
            subtitle="Passing scores"
            icon={<GraduationCap className="h-4 w-4" />}
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Results Assessed"
            value={analyticsQuery.isPending ? '—' : formatCount(analytics?.resultCount)}
            subtitle="Marked attempts"
            icon={<Users className="h-4 w-4" />}
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Subjects Active"
            value={analyticsQuery.isPending ? '—' : formatCount(analytics?.subjects?.length ?? 0)}
            subtitle="Department subjects"
            icon={<BookOpen className="h-4 w-4" />}
            isLoading={analyticsQuery.isPending}
          />
        </div>
      </ErrorBoundary>

      {/* Subject & Class Comparisons (04 §34) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ErrorBoundary>
          <ComparisonChart
            items={analytics?.subjects ?? []}
            title="Subject Performance"
            subtitle="Average scores across department subjects"
            metricLabel="Subject Avg"
            emptyMessage="No subject results recorded yet."
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <ComparisonChart
            items={analytics?.classes ?? []}
            title="Class Performance"
            subtitle="Performance comparison across academic classes"
            metricLabel="Class Avg"
            emptyMessage="No class results recorded yet."
          />
        </ErrorBoundary>
      </div>

      {/* Exam Breakdown & Term Trends */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ErrorBoundary>
          <ComparisonChart
            items={analytics?.exams ?? []}
            title="Recent Exam Performance"
            subtitle="Department assessments taken this academic period"
            metricLabel="Exam Avg"
            emptyMessage="No departmental exams finalized yet."
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <TrendChart
            trends={analytics?.termTrends ?? []}
            title="Department Term Trends"
            subtitle="Academic performance trajectory over recent terms"
            emptyMessage="Historical term trends will display here over time."
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
