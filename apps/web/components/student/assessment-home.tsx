'use client';

import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveAssessment } from '@/lib/attempt/queries';

/**
 * F13 — `04 §53` Student Home (DoD 1): the single available assessment, or
 * an honest empty state. `Assessment` *is* the student's home screen — no
 * separate dashboard concept (`nav-model.ts`'s own comment).
 */
export function AssessmentHome() {
  const router = useRouter();
  const query = useActiveAssessment();

  if (query.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full max-w-md" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Couldn't load your assessment"
      />
    );
  }

  const assessment = query.data;
  if (!assessment.examId) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No assessment is currently available"
        description="Check back once your teacher opens an examination for you."
      />
    );
  }

  const isInProgress = assessment.state === 'IN_PROGRESS' && assessment.attemptId;

  return (
    <div className="max-w-md rounded-lg border border-border bg-surface p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {isInProgress ? 'In progress' : 'Available now'}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-text-primary">{assessment.examTitle}</h2>
      <Button
        className="mt-4"
        onClick={() =>
          router.push(
            isInProgress
              ? `/student/exam/${assessment.attemptId}`
              : `/student/assessment/${assessment.examId}`,
          )
        }
      >
        {isInProgress ? 'Resume assessment' : 'View details'}
      </Button>
    </div>
  );
}
