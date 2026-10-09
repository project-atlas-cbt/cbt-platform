'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  PieChart,
  School,
  TrendingUp,
} from 'lucide-react';
import {
  useAcademicsContext,
  useClasses,
  useMyHodDepartment,
  useSubjects,
} from '@/lib/academics/queries';
import {
  formatCount,
  formatPercentage,
  useDepartmentAnalytics,
  useExamsList,
} from '@/lib/analytics';
import { ReviewQueueWidget } from '@/components/question-review/review-queue-widget';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ErrorState } from '@/components/ui/error-state';
import { HodDepartmentState } from './hod-department-state';
import { MetricTile } from './metric-tile';

export function HodDashboard() {
  const contextQuery = useAcademicsContext();
  const currentSession = contextQuery.data?.session;
  const currentTerm = contextQuery.data?.term;

  const departmentQuery = useMyHodDepartment();
  const department = departmentQuery.department;
  const departmentId = department?.id;

  const analyticsQuery = useDepartmentAnalytics(
    departmentId,
    {
      academicSessionId: currentSession?.id,
      academicTermId: currentTerm?.id,
    },
    { enabled: Boolean(departmentId) },
  );

  const classesQuery = useClasses(currentSession?.id, {
    enabled: Boolean(departmentId),
    departmentId,
  });
  const subjectsQuery = useSubjects();

  const examsQuery = useExamsList(
    {
      ...(departmentId ? { departmentId } : {}),
      ...(currentSession?.id ? { academicSessionId: currentSession.id } : {}),
      ...(currentTerm?.id ? { academicTermId: currentTerm.id } : {}),
    },
    { enabled: Boolean(departmentId) },
  );

  const departmentSubjects = useMemo(() => {
    if (!departmentId || !subjectsQuery.data?.subjects) return [];
    return subjectsQuery.data.subjects.filter((s) => s.departmentId === departmentId);
  }, [departmentId, subjectsQuery.data]);

  const departmentClasses = useMemo(() => {
    if (!departmentId || !classesQuery.data?.classes) return [];
    return classesQuery.data.classes.filter((c) => c.status !== 'ARCHIVED');
  }, [departmentId, classesQuery.data]);

  // P1-12: no department to show (the list failed, or this HOD heads none)
  // is said plainly rather than shown as empty results.
  const departmentUnavailable =
    departmentQuery.isError || (departmentQuery.isSuccess && !department);

  const examCounts = useMemo(() => {
    const items = examsQuery.data?.exams ?? [];
    return {
      active: items.filter(
        (e) => (e.status as string) === 'OPEN' || (e.status as string) === 'ACTIVE',
      ).length,
      completed: items.filter((e) => e.status === 'COMPLETED').length,
    };
  }, [examsQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            {department?.name || 'Department'} Dashboard
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Your department&apos;s question review, exam readiness and results.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/hod/department-analytics"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-95"
          >
            <PieChart className="h-3.5 w-3.5" />
            <span>Department Analytics</span>
          </Link>
        </div>
      </div>

      {/* Prominent Pending Review Queue Widget (04 §29, §70) */}
      <ErrorBoundary>
        <ReviewQueueWidget />
      </ErrorBoundary>

      {/* Department Readiness & Performance Overview */}
      <ErrorBoundary>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text-primary">
              Department Academic Overview
            </h2>
            <Link
              href="/hod/department-analytics"
              className="text-xs font-medium text-brand-primary hover:underline inline-flex items-center gap-1"
            >
              <span>Performance Analytics</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {departmentUnavailable ? (
            <HodDepartmentState departmentQuery={departmentQuery} />
          ) : analyticsQuery.isError ? (
            <ErrorState
              error={analyticsQuery.error}
              onRetry={() => void analyticsQuery.refetch()}
              title="Department results couldn't be loaded"
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <MetricTile
                label="Department Average"
                value={
                  analyticsQuery.isPending
                    ? '—'
                    : formatPercentage(analyticsQuery.data?.averagePercentage)
                }
                subtitle="Score average"
                icon={<TrendingUp className="h-4 w-4" />}
                emphasis
                isLoading={analyticsQuery.isPending}
              />
              <MetricTile
                label="Department Subjects"
                value={formatCount(departmentSubjects.length)}
                icon={<BookOpen className="h-4 w-4" />}
                isLoading={subjectsQuery.isPending}
              />
              <MetricTile
                label="Department Classes"
                value={formatCount(departmentClasses.length)}
                icon={<School className="h-4 w-4" />}
                isLoading={classesQuery.isPending}
              />
              <MetricTile
                label="Active Exams"
                value={formatCount(examCounts.active)}
                icon={<ClipboardList className="h-4 w-4" />}
                isLoading={examsQuery.isPending}
              />
              <MetricTile
                label="Completed Exams"
                value={formatCount(examCounts.completed)}
                icon={<CheckCircle2 className="h-4 w-4" />}
                isLoading={examsQuery.isPending}
              />
            </div>
          )}
        </div>
      </ErrorBoundary>

      {/* Subject Performance Breakdown Preview */}
      {analyticsQuery.data?.subjects && analyticsQuery.data.subjects.length > 0 ? (
        <ErrorBoundary>
          <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Subject Averages</h3>
              <Link
                href="/hod/department-analytics"
                className="text-xs font-medium text-brand-primary hover:underline inline-flex items-center gap-1"
              >
                <span>Full Comparison</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {analyticsQuery.data.subjects.map((sub) => (
                <div
                  key={sub.id}
                  className="rounded-md border border-border/60 bg-surface-raised/30 p-3 text-xs space-y-1"
                >
                  <p className="font-medium text-text-primary truncate">{sub.name}</p>
                  <p className="text-lg font-bold tabular-nums text-brand-primary">
                    {formatPercentage(sub.averagePercentage)}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {formatCount(sub.resultCount)} results recorded
                  </p>
                </div>
              ))}
            </div>
          </div>
        </ErrorBoundary>
      ) : null}
    </div>
  );
}
