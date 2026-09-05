'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssessmentPreview } from '@/lib/attempt/queries';
import { useStartAttempt } from '@/lib/attempt/mutations';
import { describeAttemptError } from '@/lib/attempt/error-utils';
import { buildMediaManifestFromPackage } from '@/lib/attempt/media-cache';
import { MediaDownloadGate } from './media-download-gate';

/**
 * F13 — `04 §54` Assessment Preview (DoD 2): question count, duration,
 * attempts, and instructions before starting. Clicking Start creates (or
 * idempotently resumes — B13, DoD 3) the attempt, then gates on
 * `MediaDownloadGate` (ADR-0021) before entering the runtime.
 */
export function AssessmentPreview({ examId }: { examId: string }) {
  const router = useRouter();
  const preview = useAssessmentPreview(examId);
  const startAttempt = useStartAttempt();
  const [startedAttemptId, setStartedAttemptId] = useState<string | null>(null);
  const [startError, setStartError] = useState<unknown>(null);

  const handleStart = () => {
    setStartError(null);
    startAttempt.mutate(examId, {
      onSuccess: (attemptPackage) => {
        void buildMediaManifestFromPackage(
          attemptPackage.attemptId,
          attemptPackage.questions.map((q) => ({
            examQuestionId: q.examQuestionId,
            media: q.media,
          })),
        ).then(() => setStartedAttemptId(attemptPackage.attemptId));
      },
      onError: (error) => setStartError(error),
    });
  };

  if (startedAttemptId) {
    return (
      <MediaDownloadGate
        attemptId={startedAttemptId}
        onComplete={() => router.push(`/student/exam/${startedAttemptId}`)}
      />
    );
  }

  if (preview.isPending) {
    return (
      <div className="max-w-lg space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (preview.isError) {
    return (
      <ErrorState
        error={preview.error}
        onRetry={() => void preview.refetch()}
        title="Couldn't load this assessment"
      />
    );
  }

  const data = preview.data;
  const minutes = Math.round(data.durationSeconds / 60);

  return (
    <div className="max-w-lg space-y-4 rounded-lg border border-border bg-surface p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{data.title}</h2>
        <p className="text-sm text-text-muted">{data.examType}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-text-muted">Questions</dt>
          <dd className="font-medium tabular-nums text-text-primary">{data.questionCount}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Duration</dt>
          <dd className="font-medium tabular-nums text-text-primary">{minutes} minutes</dd>
        </div>
        <div>
          <dt className="text-text-muted">Total marks</dt>
          <dd className="font-medium tabular-nums text-text-primary">{data.totalMarks}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Attempts allowed</dt>
          <dd className="font-medium tabular-nums text-text-primary">{data.attemptLimit}</dd>
        </div>
      </dl>

      {data.generalInstructions ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Instructions
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-text-secondary">
            {data.generalInstructions}
          </p>
        </div>
      ) : null}

      {startError ? (
        <p role="alert" className="text-sm text-danger">
          {describeAttemptError(startError)}
        </p>
      ) : null}

      <Button
        onClick={handleStart}
        loading={startAttempt.isPending}
        disabled={startAttempt.isPending}
      >
        Start assessment
      </Button>
    </div>
  );
}
