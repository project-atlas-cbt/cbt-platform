'use client';

import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format/date';
import { formatResultPercentage } from '@/lib/results/format';
import { useStudentResults } from '@/lib/results/queries';
import { ResultGradeBadge } from './result-grade-badge';

/**
 * F14 — `04 §60` "My Results" (`ST-08`). Single-audience screen (always
 * "my own", never a role-scoped/`basePath` split like `ExamListScreen`) —
 * closer in shape to `AssessmentHome`'s simple card layout than a
 * multi-role `DataTable` screen, matching `student-results.v1`'s own
 * unpaginated, filter-less contract. Only published results are ever
 * returned by the server (DoD items 1/2/3) — this screen renders exactly
 * what it's given, with no client-side filtering to get wrong.
 */
export function ResultsListScreen() {
  const query = useStudentResults();

  if (query.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full max-w-lg" />
        <Skeleton className="h-16 w-full max-w-lg" />
        <Skeleton className="h-16 w-full max-w-lg" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Couldn't load your results"
      />
    );
  }

  const items = query.data.items;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No results yet"
        description="Published results for exams you've taken will appear here."
      />
    );
  }

  return (
    <ul className="max-w-lg space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`results/${item.id}`}
            className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-brand-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {item.subjectName}
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-text-primary">{item.examTitle}</h2>
              <ResultGradeBadge grade={item.grade} />
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-text-muted">
              <span>{formatResultPercentage(item.percentage)}</span>
              {item.publishedAt ? <span>{formatDate(item.publishedAt)}</span> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
