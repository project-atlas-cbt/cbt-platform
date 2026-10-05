'use client';

import Link from 'next/link';
import { ArrowLeft, BookOpen, GraduationCap, TrendingUp, Users } from 'lucide-react';
import { useExam } from '@/lib/exams/queries';
import {
  formatCount,
  formatPercentage,
  useExamAnalytics,
  useExamQuestionAnalytics,
} from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { MetricTile } from './metric-tile';
import { QuestionPerformanceTable } from './question-performance-table';
import { PerformanceChart } from './performance-chart';
import { ComparisonChart } from './comparison-chart';

export interface QuestionAnalyticsViewProps {
  examId: string;
}

export function QuestionAnalyticsView({ examId }: QuestionAnalyticsViewProps) {
  const examQuery = useExam(examId);
  const examAnalyticsQuery = useExamAnalytics(examId);
  const questionAnalyticsQuery = useExamQuestionAnalytics(examId);

  const exam = examQuery.data;
  const examAnalytics = examAnalyticsQuery.data;
  const questions = questionAnalyticsQuery.data?.items ?? [];

  const classComparisonItems = (examAnalytics?.classBreakdown ?? []).map((c) => ({
    id: c.classId,
    name: c.className,
    averagePercentage: c.averagePercentage,
    highestPercentage: c.highestPercentage,
    lowestPercentage: c.lowestPercentage,
    passRate: c.passRate,
    resultCount: c.resultCount,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link href={`/teacher/results/${examId}`}>
            <Button variant="secondary" size="sm" className="h-8 gap-1 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Exam Results</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              {exam?.title || 'Exam Analytics'}
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Question-by-question performance, difficulty rates, and class breakdowns
            </p>
          </div>
        </div>

        {exam ? (
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text-secondary">
              Status: {exam.status}
            </span>
          </div>
        ) : null}
      </div>

      {/* Exam Analytics Metrics */}
      <ErrorBoundary>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile
            label="Average Score"
            value={
              examAnalyticsQuery.isPending
                ? '—'
                : formatPercentage(examAnalytics?.averagePercentage)
            }
            subtitle="Overall exam average"
            icon={<TrendingUp className="h-4 w-4" />}
            emphasis
            isLoading={examAnalyticsQuery.isPending}
          />
          <MetricTile
            label="Pass Rate"
            value={examAnalyticsQuery.isPending ? '—' : formatPercentage(examAnalytics?.passRate)}
            subtitle="Passing students"
            icon={<GraduationCap className="h-4 w-4" />}
            isLoading={examAnalyticsQuery.isPending}
          />
          <MetricTile
            label="Students Assessed"
            value={examAnalyticsQuery.isPending ? '—' : formatCount(examAnalytics?.resultCount)}
            subtitle="Finalized results"
            icon={<Users className="h-4 w-4" />}
            isLoading={examAnalyticsQuery.isPending}
          />
          <MetricTile
            label="Completion Rate"
            value={
              examAnalyticsQuery.isPending
                ? '—'
                : formatPercentage(examAnalytics?.participation?.completionRate)
            }
            subtitle="Attendance rate"
            icon={<BookOpen className="h-4 w-4" />}
            isLoading={examAnalyticsQuery.isPending}
          />
        </div>
      </ErrorBoundary>

      {/* Question Performance Table */}
      <ErrorBoundary>
        {questionAnalyticsQuery.isPending ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-5">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <QuestionPerformanceTable questions={questions} examTitle={exam?.title} />
        )}
      </ErrorBoundary>

      {/* Score Distribution & Class Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ErrorBoundary>
          <PerformanceChart
            distribution={examAnalytics?.distribution ?? []}
            title="Score Distribution"
            subtitle="Finalized student scores across percentage buckets"
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <ComparisonChart
            items={classComparisonItems}
            title="Class Breakdown"
            subtitle="Performance comparison across classes taking this exam"
            metricLabel="Class Avg"
            emptyMessage="No class breakdown available for this exam."
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
