'use client';

import Link from 'next/link';
import { ArrowLeft, GraduationCap, School, TrendingUp, Users } from 'lucide-react';
import { useClass } from '@/lib/academics/queries';
import {
  formatCount,
  formatPercentage,
  useClassAnalytics,
  useClassStudents,
} from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { MetricTile } from './metric-tile';
import { ComparisonChart } from './comparison-chart';

export interface ClassDetailViewProps {
  classId: string;
}

export function ClassDetailView({ classId }: ClassDetailViewProps) {
  const classQuery = useClass(classId);
  const analyticsQuery = useClassAnalytics(classId);
  const studentsQuery = useClassStudents(classId);

  const cls = classQuery.data;
  const analytics = analyticsQuery.data;
  const students = studentsQuery.data?.students ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link href="/teacher/my-classes">
            <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Classes</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              {cls?.name || 'Class Details'}
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Class performance, exams, and enrolled students
            </p>
          </div>
        </div>

        {cls ? (
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text-secondary">
              Level: {cls.level}
            </span>
            <span className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text-secondary">
              Arm: {cls.arm}
            </span>
          </div>
        ) : null}
      </div>

      {/* Class Performance Metrics */}
      <ErrorBoundary>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile
            label="Average Performance"
            value={analyticsQuery.isPending ? '—' : formatPercentage(analytics?.averagePercentage)}
            subtitle="Class score average"
            icon={<TrendingUp className="h-4 w-4" />}
            emphasis
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Pass Rate"
            value={analyticsQuery.isPending ? '—' : formatPercentage(analytics?.passRate)}
            subtitle="Passing grades"
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
            subtitle="Assessment attendance"
            icon={<Users className="h-4 w-4" />}
            isLoading={analyticsQuery.isPending}
          />
          <MetricTile
            label="Enrolled Students"
            value={studentsQuery.isPending ? '—' : formatCount(students.length)}
            subtitle="Class roster"
            icon={<School className="h-4 w-4" />}
            isLoading={studentsQuery.isPending}
          />
        </div>
      </ErrorBoundary>

      {/* Subject & Exam Comparisons */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ErrorBoundary>
          <ComparisonChart
            items={analytics?.subjects ?? []}
            title="Subjects Taught"
            subtitle="Performance comparison across subjects for this class"
            metricLabel="Class Avg"
            emptyMessage="No subject assessment results recorded for this class yet."
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <ComparisonChart
            items={analytics?.exams ?? []}
            title="Class Exams"
            subtitle="Scores recorded across exams taken by this class"
            metricLabel="Exam Avg"
            emptyMessage="No exams completed by this class yet."
          />
        </ErrorBoundary>
      </div>

      {/* Student Roster Table */}
      <ErrorBoundary>
        <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Enrolled Students</h3>
            <span className="text-xs text-text-muted">{students.length} students</span>
          </div>

          {studentsQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : students.length === 0 ? (
            <p className="text-xs text-text-muted py-4 text-center">
              No students enrolled in this class yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs" aria-label="Class student roster">
                <thead className="bg-surface-raised/60 text-text-muted border-b border-border font-medium">
                  <tr>
                    <th scope="col" className="py-2.5 px-3">
                      Student Name
                    </th>
                    <th scope="col" className="py-2.5 px-3">
                      Student ID
                    </th>
                    <th scope="col" className="py-2.5 px-3">
                      Enrolled Since
                    </th>
                    <th scope="col" className="py-2.5 px-3 text-center">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {students.map((student) => (
                    <tr key={student.enrollmentId} className="hover:bg-surface-raised/40">
                      <td className="py-2 px-3 font-medium text-text-primary">
                        {student.displayName}
                      </td>
                      <td className="py-2 px-3 tabular-nums text-text-secondary font-mono">
                        {student.studentId}
                      </td>
                      <td className="py-2 px-3 text-text-muted">
                        {student.startDate ? student.startDate.split('T')[0] : '—'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          Enrolled
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ErrorBoundary>
    </div>
  );
}
